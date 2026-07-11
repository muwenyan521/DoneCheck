import { buildSemanticJudgementPrompt } from "../prompts/index.js";
import { normalizeEvidenceRefs } from "./evidence-ref-normalization.js";
import { mapWithConcurrency } from "./limit.js";
import type { LLMProvider } from "./provider.js";
import type { RetryOptions } from "./retry.js";
import { withRetry } from "./retry.js";
import {
  type CandidateFileMetadata,
  type EvidenceSnippet,
  type SemanticClaim,
  type SemanticEvidenceRef,
  type SemanticJudgementDraft,
  type SemanticRequirement,
  semanticJudgementDraftSchema,
} from "./schema.js";

export interface DraftSemanticJudgementInput {
  readonly candidateFiles?: readonly CandidateFileMetadata[];
  readonly claim?: SemanticClaim;
  readonly evidenceSnippets: readonly EvidenceSnippet[];
  readonly onNormalizationWarnings?: (warnings: readonly string[]) => void;
  readonly provider: LLMProvider;
  readonly requirement: SemanticRequirement;
  readonly retry?: RetryOptions;
}

export interface DraftSemanticJudgementsInput {
  readonly candidateFiles?: readonly CandidateFileMetadata[];
  readonly claim?: SemanticClaim;
  readonly concurrency?: number;
  readonly evidenceSnippets: readonly EvidenceSnippet[];
  readonly onNormalizationWarnings?: (warnings: readonly string[]) => void;
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

  const normalized = normalizeEvidenceRefs(draft.evidenceRefs, input.evidenceSnippets);
  const canonicalRefs = collectCanonicalRefs(normalized);

  if (input.onNormalizationWarnings !== undefined && normalized.warnings.length > 0) {
    input.onNormalizationWarnings(normalized.warnings);
  }

  return { ...draft, evidenceRefs: canonicalRefs };
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
      ...(input.onNormalizationWarnings === undefined
        ? {}
        : { onNormalizationWarnings: input.onNormalizationWarnings }),
    }),
  );
}

function collectCanonicalRefs(
  normalized: ReturnType<typeof normalizeEvidenceRefs>,
): SemanticEvidenceRef[] {
  return normalized.refs.map((entry) => {
    if (entry.kind === "unmatched") {
      throw new Error(
        `Evidence ref ${entry.reason} is not present in candidate evidence snippets.`,
      );
    }
    return entry.ref;
  });
}
