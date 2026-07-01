import { extractEvidenceSnippets } from "../evidence/snippet.js";
import { buildJudgementReport } from "../rules/index.js";
import type { FakeImplementationSignal, JudgementReport } from "../rules/schema.js";
import { selectCandidateFiles } from "../semantic/file-selection.js";
import type { LLMProvider } from "../semantic/provider.js";
import type { EvidenceSnippet, StaticSignal } from "../semantic/schema.js";
import { draftSemanticJudgements } from "../semantic/semantic-judgement.js";
import { scanFakeImplementationSignals, scanStaticSignals } from "../static-signals/scanner.js";

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

  const selection = await selectCandidateFiles({
    requirement: input.requirement,
    ...(input.claim === undefined ? {} : { claim: input.claim }),
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
    const snippet = extractEvidenceSnippets({
      content,
      filePath: candidatePath,
      refs: [
        {
          filePath: candidatePath,
          lineStart: 1,
          lineEnd: Math.min(lineCount, 40),
          snippetSummary: candidatePath,
        },
      ],
    });
    evidenceSnippets.push(...snippet);
  }

  const requirements = [{ id: "REQ-1", text: input.requirement }];
  const claims = input.claim === undefined ? [] : [{ id: "CLAIM-1", text: input.claim }];

  const drafts = await draftSemanticJudgements({
    requirements,
    ...(claims.length === 0 ? {} : { claim: claims[0] }),
    candidateFiles: selection.candidateFiles.map((p) => ({
      filePath: p,
      recallSource: "llmSelected" as const,
    })),
    evidenceSnippets,
    provider: input.provider,
  });

  const report = buildJudgementReport({
    requirements,
    claims,
    extraScopeCandidates: [],
    fakeImplementationSignals,
    staticSignals: [],
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
