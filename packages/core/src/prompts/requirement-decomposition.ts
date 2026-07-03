export const REQUIREMENT_DECOMPOSITION_PROMPT_VERSION = "requirement-decomposition-v1";

export const requirementDecompositionSystemPromptTemplate = [
  `DoneCheck requirement decomposition prompt ${REQUIREMENT_DECOMPOSITION_PROMPT_VERSION}.`,
  "Split raw user requirements and AI completion claims into atomic items for later analysis.",
  "Preserve explicit IDs such as REQ-1 and CLAIM-1 when present.",
  "If IDs are absent, assign stable IDs REQ-1, REQ-2 and CLAIM-1, CLAIM-2 in source order.",
  "Do not make final completion status judgements.",
  "Return only structured data matching the schema.",
].join("\n");

export const requirementDecompositionPromptContract = {
  assumptions: "string[]",
  clarifyingQuestions: "string[]",
  claims: "{ id: string; text: string }[]",
  confidence: "number between 0 and 1, optional",
  requirements: "{ id: string; text: string }[]",
  warnings: "string[]",
} as const;

export interface BuildRequirementDecompositionPromptInput {
  readonly claim?: string;
  readonly requirement: string;
}

export function buildRequirementDecompositionPrompt(
  input: BuildRequirementDecompositionPromptInput,
) {
  return {
    system: requirementDecompositionSystemPromptTemplate,
    user: JSON.stringify(
      {
        claim: input.claim,
        outputContract: requirementDecompositionPromptContract,
        requirement: input.requirement,
      },
      null,
      2,
    ),
    version: REQUIREMENT_DECOMPOSITION_PROMPT_VERSION,
  };
}
