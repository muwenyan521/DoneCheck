import { buildSemanticJudgementPrompt } from "../prompts/semantic-judgement.js";
import { mapWithConcurrency } from "./limit.js";
import type { LLMProvider } from "./provider.js";
import type { RetryOptions } from "./retry.js";
import { withRetry } from "./retry.js";
import {
  type CandidateFileMetadata,
  type EvidenceSnippet,
  type SemanticClaim,
  type SemanticJudgementDraft,
  type SemanticRequirement,
  semanticJudgementDraftSchema,
} from "./schema.js";

export interface DraftSemanticJudgementInput {
  readonly candidateFiles?: readonly CandidateFileMetadata[];
  readonly claim?: SemanticClaim;
  readonly evidenceSnippets: readonly EvidenceSnippet[];
  readonly provider: LLMProvider;
  readonly requirement: SemanticRequirement;
  readonly retry?: RetryOptions;
}

export interface DraftSemanticJudgementsInput {
  readonly candidateFiles?: readonly CandidateFileMetadata[];
  readonly claim?: SemanticClaim;
  readonly concurrency?: number;
  readonly evidenceSnippets: readonly EvidenceSnippet[];
  readonly provider: LLMProvider;
  readonly requirements: readonly SemanticRequirement[];
  readonly retry?: RetryOptions;
}

export async function draftSemanticJudgement(
  input: DraftSemanticJudgementInput,
): Promise<SemanticJudgementDraft> {
  const prompt = buildSemanticJudgementPrompt({
    evidenceSnippets: input.evidenceSnippets,
    requirement: input.requirement,
    ...(input.candidateFiles === undefined ? {} : { candidateFiles: input.candidateFiles }),
    ...(input.claim === undefined ? {} : { claim: input.claim }),
  });
  const response = await withRetry(
    () =>
      input.provider.generateObject({
        prompt,
        schema: semanticJudgementDraftSchema,
        schemaName: "SemanticJudgementDraft",
      }),
    input.retry,
  );

  const draft = semanticJudgementDraftSchema.parse(response.object);

  assertEvidenceRefsExist(draft, input.evidenceSnippets);

  return draft;
}

export async function draftSemanticJudgements(
  input: DraftSemanticJudgementsInput,
): Promise<SemanticJudgementDraft[]> {
  return mapWithConcurrency(input.requirements, input.concurrency ?? 2, (requirement) =>
    draftSemanticJudgement({
      evidenceSnippets: input.evidenceSnippets,
      provider: input.provider,
      requirement,
      ...(input.candidateFiles === undefined ? {} : { candidateFiles: input.candidateFiles }),
      ...(input.claim === undefined ? {} : { claim: input.claim }),
      ...(input.retry === undefined ? {} : { retry: input.retry }),
    }),
  );
}

function assertEvidenceRefsExist(
  draft: SemanticJudgementDraft,
  snippets: readonly EvidenceSnippet[],
): void {
  const snippetRefs = new Set(
    snippets.map((snippet) => evidenceKey(snippet.filePath, snippet.lineStart, snippet.lineEnd)),
  );

  for (const evidenceRef of draft.evidenceRefs) {
    const key = evidenceKey(evidenceRef.filePath, evidenceRef.lineStart, evidenceRef.lineEnd);
    if (!snippetRefs.has(key)) {
      throw new Error(`Evidence ref ${key} is not present in candidate evidence snippets.`);
    }
  }
}

function evidenceKey(filePath: string, lineStart: number, lineEnd: number): string {
  return `${filePath}:${lineStart}-${lineEnd}`;
}
