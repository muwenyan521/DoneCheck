import type {
  CandidateFileMetadata,
  EvidenceSnippet,
  SemanticClaim,
  SemanticRequirement,
} from "../semantic/schema.js";

export const SEMANTIC_JUDGEMENT_PROMPT_VERSION = "semantic-judgement-v1";

export const semanticJudgementSystemPromptTemplate = [
  `DoneCheck phase 3 semantic judgement prompt ${SEMANTIC_JUDGEMENT_PROMPT_VERSION}.`,
  "Compare requirement, optional claim, and candidate evidence snippets.",
  "Return a semantic judgement draft only: fulfilled, partial, unsupported, or suspicious.",
  "Do not map to final six-state report statuses or core pass/fail/partial aggregation.",
  "Evidence refs must point to provided snippets.",
].join("\n");

export const semanticJudgementDraftPromptContract = {
  confidence: "number between 0 and 1",
  evidenceRefs: "non-empty refs with filePath, lineStart, lineEnd, snippetSummary",
  explanation: "string",
  judgementDraft: "fulfilled | partial | unsupported | suspicious",
  matchedClaimId: "optional string",
  matchedRequirementId: "optional string",
  possibleExtraScope: "optional string[]",
  repairSuggestion: "actionable string",
} as const;

export interface BuildSemanticJudgementPromptInput {
  readonly candidateFiles?: readonly CandidateFileMetadata[];
  readonly claim?: SemanticClaim;
  readonly evidenceSnippets: readonly EvidenceSnippet[];
  readonly requirement: SemanticRequirement;
}

export function buildSemanticJudgementPrompt(input: BuildSemanticJudgementPromptInput) {
  return {
    system: semanticJudgementSystemPromptTemplate,
    user: JSON.stringify(
      {
        candidateFiles: input.candidateFiles ?? [],
        claim: input.claim,
        evidenceSnippets: input.evidenceSnippets,
        outputContract: semanticJudgementDraftPromptContract,
        requirement: input.requirement,
      },
      null,
      2,
    ),
    version: SEMANTIC_JUDGEMENT_PROMPT_VERSION,
  };
}
