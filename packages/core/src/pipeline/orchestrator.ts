import { extractEvidenceSnippets } from "../evidence/snippet.js";
import { buildJudgementReport } from "../rules/index.js";
import type {
  FakeImplementationSignal,
  JudgementReport,
  TargetedStaticSignal,
} from "../rules/schema.js";
import { selectCandidateFiles } from "../semantic/file-selection.js";
import { mapWithConcurrency } from "../semantic/limit.js";
import type { LLMProvider } from "../semantic/provider.js";
import type { EvidenceSnippet, StaticSignal } from "../semantic/schema.js";
import { draftSemanticJudgements } from "../semantic/semantic-judgement.js";
import { scanFakeImplementationSignals, scanStaticSignals } from "../static-signals/scanner.js";
import { selectEvidenceForRequirement } from "./evidence-selection.js";
import {
  buildExtraScopeCandidates,
  matchClaimsToRequirements,
  targetSignals,
} from "./item-matching.js";

export interface PipelineFile {
  readonly relativePath: string;
  readonly content: string;
}

export interface OrchestrateAnalysisInput {
  readonly requirement: string;
  readonly claim?: string;
  readonly files: readonly PipelineFile[];
  readonly provider: LLMProvider;
  readonly generatedAt: string;
  readonly claims?: readonly import("../semantic/schema.js").SemanticClaim[];
  readonly requirements?: readonly import("../semantic/schema.js").SemanticRequirement[];
  readonly topK?: number;
  readonly concurrency?: number;
  readonly signal?: AbortSignal;
}

export interface PipelineOutput {
  readonly report: JudgementReport;
  readonly staticSignals: StaticSignal[];
  readonly fakeImplementationSignals: FakeImplementationSignal[];
  readonly selectedFiles: readonly string[];
  readonly evidenceSnippets: EvidenceSnippet[];
}

export async function orchestrateAnalysis(
  input: OrchestrateAnalysisInput,
): Promise<PipelineOutput> {
  const staticSignals: StaticSignal[] = [];
  const fakeImplementationSignals: FakeImplementationSignal[] = [];
  for (const file of input.files) {
    staticSignals.push(
      ...scanStaticSignals({ filePath: file.relativePath, content: file.content }),
    );
    fakeImplementationSignals.push(
      ...scanFakeImplementationSignals({
        filePath: file.relativePath,
        content: file.content,
      }),
    );
  }

  const structureSummary = input.files
    .map((f) => `${f.relativePath} (${f.content.split(/\r?\n/).length} lines)`)
    .join("\n");

  const projectFiles = input.files.map((f) => f.relativePath);

  const requirements = dedupById(input.requirements ?? [{ id: "REQ-1", text: input.requirement }]);
  const claims = dedupById(
    input.claims ?? (input.claim === undefined ? [] : [{ id: "CLAIM-1", text: input.claim }]),
  );
  const matches = matchClaimsToRequirements(requirements, claims);
  const selectionRequirement = requirements.map((item) => `${item.id}: ${item.text}`).join("\n");
  const selectionClaim = claims.map((item) => `${item.id}: ${item.text}`).join("\n");

  const selection = await selectCandidateFiles({
    requirement: selectionRequirement,
    ...(selectionClaim.length === 0 ? {} : { claim: selectionClaim }),
    projectFiles,
    provider: input.provider,
    staticSignals,
    structureSummary,
    ...(input.topK === undefined ? {} : { topK: input.topK }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });

  const fileMap = new Map(input.files.map((f) => [f.relativePath, f.content]));
  const signalLinesByFile = new Map<string, number[]>();
  for (const signal of [...fakeImplementationSignals, ...staticSignals]) {
    const lines = signalLinesByFile.get(signal.filePath) ?? [];
    if ("lineStart" in signal && typeof signal.lineStart === "number") {
      lines.push(signal.lineStart);
    }
    signalLinesByFile.set(signal.filePath, lines);
  }
  const evidenceSnippets: EvidenceSnippet[] = [];
  for (const candidatePath of selection.candidateFiles) {
    const content = fileMap.get(candidatePath);
    if (content === undefined) continue;
    const splitLines = content.split(/\r?\n/);
    const lineCount =
      splitLines.length > 0 && splitLines[splitLines.length - 1] === ""
        ? splitLines.length - 1
        : splitLines.length;
    if (lineCount < 1) continue;
    const snippets = extractEvidenceSnippets({
      content,
      filePath: candidatePath,
      refs: buildEvidenceRefs(candidatePath, lineCount, signalLinesByFile.get(candidatePath)),
    });
    evidenceSnippets.push(...snippets);
  }

  const targeted = targetSignals({
    candidateFiles: selection.candidateFiles,
    claims,
    fakeImplementationSignals,
    matches,
    requirements,
    staticSignals: targetStaticSignals(staticSignals),
  });

  const normalizationWarnings: string[] = [];
  const draftResults = await mapWithConcurrency(
    requirements,
    input.concurrency ?? 3,
    async (requirement) => {
      const match = matches.find((item) => item.requirement.id === requirement.id);
      return draftSemanticJudgements({
        requirements: [requirement],
        ...(match === undefined ? {} : { claim: match.claim }),
        candidateFiles: selection.candidateFiles.map((p) => ({
          filePath: p,
          recallSource: "llmSelected" as const,
        })),
        evidenceSnippets: selectEvidenceForRequirement({
          candidateFiles: selection.candidateFiles,
          ...(match === undefined ? {} : { claim: match.claim, match }),
          evidenceSnippets,
          fakeImplementationSignals: targeted.fakeImplementationSignals,
          requirement,
          staticSignals: targeted.staticSignals,
        }),
        onNormalizationWarnings: (warnings) => {
          for (const warning of warnings) {
            normalizationWarnings.push(`Requirement "${requirement.text}": ${warning}`);
          }
        },
        provider: input.provider,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
    },
  );
  const drafts = draftResults.flat();

  const claimIds = new Set(claims.map((claim) => claim.id));
  const fixedDrafts = drafts.map((draft) => {
    const llmClaimId = draft.matchedClaimId;
    if (llmClaimId !== undefined && claimIds.has(llmClaimId)) return draft;
    const matchedRequirement = matches.find(
      (item) => item.requirement.id === draft.matchedRequirementId,
    );
    const correctClaimId = matchedRequirement?.claim.id;
    if (correctClaimId === undefined && llmClaimId === undefined) return draft;
    return { ...draft, matchedClaimId: correctClaimId };
  });

  const codeEvidencedExtraScope = fixedDrafts.flatMap((draft) => {
    if (draft.possibleExtraScope === undefined || draft.possibleExtraScope.length === 0) return [];
    const baseId = draft.matchedRequirementId ?? draft.matchedClaimId ?? "unknown";
    return draft.possibleExtraScope.map((description, index) => ({
      evidenceRefs: draft.evidenceRefs,
      id: `extra-code-${baseId}-${index}`,
      sourceId: baseId,
      summary: description,
    }));
  });

  const report = buildJudgementReport({
    requirements: [...requirements],
    claims: [...claims],
    extraScopeCandidates: [
      ...buildExtraScopeCandidates({ claims, matches, requirements }),
      ...codeEvidencedExtraScope,
    ],
    fakeImplementationSignals: targeted.fakeImplementationSignals,
    staticSignals: targeted.staticSignals,
    semanticDrafts: fixedDrafts,
    generatedAt: input.generatedAt,
  });

  if (normalizationWarnings.length > 0) {
    report.warnings = [...report.warnings, ...normalizationWarnings];
  }

  return {
    report,
    staticSignals,
    fakeImplementationSignals,
    selectedFiles: selection.candidateFiles,
    evidenceSnippets,
  };
}

function targetStaticSignals(signals: readonly StaticSignal[]): TargetedStaticSignal[] {
  return signals.map((signal) => ({ ...signal }));
}

function buildEvidenceRefs(filePath: string, lineCount: number, signalLines?: readonly number[]) {
  const refs = [
    {
      filePath,
      lineStart: 1,
      lineEnd: Math.min(lineCount, 40),
      snippetSummary: filePath,
    },
  ];
  if (signalLines !== undefined) {
    for (const line of signalLines) {
      const start = Math.max(1, line - 5);
      const end = Math.min(lineCount, line + 5);
      refs.push({ filePath, lineStart: start, lineEnd: end, snippetSummary: filePath });
    }
  }
  if (lineCount > 40) {
    refs.push({
      filePath,
      lineStart: lineCount - Math.min(lineCount, 10),
      lineEnd: lineCount,
      snippetSummary: filePath,
    });
  }
  return refs;
}

function dedupById<T extends { readonly id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}
