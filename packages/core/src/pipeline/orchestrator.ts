import { extractEvidenceSnippets } from "../evidence/snippet.js";
import { buildJudgementReport } from "../rules/index.js";
import type {
  FakeImplementationSignal,
  JudgementReport,
  TargetedStaticSignal,
} from "../rules/schema.js";
import { selectCandidateFiles } from "../semantic/file-selection.js";
import type { LLMProvider } from "../semantic/provider.js";
import type { EvidenceSnippet, StaticSignal } from "../semantic/schema.js";
import { draftSemanticJudgements } from "../semantic/semantic-judgement.js";
import { scanFakeImplementationSignals, scanStaticSignals } from "../static-signals/scanner.js";
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
  });

  const fileMap = new Map(input.files.map((f) => [f.relativePath, f.content]));
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
      refs: buildEvidenceRefs(candidatePath, lineCount),
    });
    evidenceSnippets.push(...snippets);
  }

  const drafts = (
    await Promise.all(
      requirements.map((requirement) => {
        const match = matches.find((item) => item.requirement.id === requirement.id);
        return draftSemanticJudgements({
          requirements: [requirement],
          ...(match === undefined ? {} : { claim: match.claim }),
          candidateFiles: selection.candidateFiles.map((p) => ({
            filePath: p,
            recallSource: "llmSelected" as const,
          })),
          evidenceSnippets,
          provider: input.provider,
        });
      }),
    )
  ).flat();

  const targeted = targetSignals({
    claims,
    fakeImplementationSignals,
    matches,
    requirements,
    staticSignals: targetStaticSignals(staticSignals),
  });

  const report = buildJudgementReport({
    requirements: [...requirements],
    claims: [...claims],
    extraScopeCandidates: buildExtraScopeCandidates({ claims, matches, requirements }),
    fakeImplementationSignals: targeted.fakeImplementationSignals,
    staticSignals: targeted.staticSignals,
    semanticDrafts: drafts,
    generatedAt: input.generatedAt,
  });

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

function buildEvidenceRefs(filePath: string, lineCount: number) {
  const refs = [
    {
      filePath,
      lineStart: 1,
      lineEnd: Math.min(lineCount, 40),
      snippetSummary: filePath,
    },
  ];
  for (let start = 1; start <= lineCount; start += 1) {
    for (let end = start; end <= Math.min(lineCount, start + 39); end += 1) {
      refs.push({
        filePath,
        lineStart: start,
        lineEnd: end,
        snippetSummary: filePath,
      });
    }
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
