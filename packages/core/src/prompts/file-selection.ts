import type { StaticSignal } from "../semantic/schema.js";

export const FILE_SELECTION_PROMPT_VERSION = "file-selection-v1";

export interface BuildFileSelectionPromptInput {
  readonly claim?: string;
  readonly requirement: string;
  readonly staticSignals?: readonly StaticSignal[];
  readonly structureSummary: string;
  readonly topK: number;
}

export function buildFileSelectionPrompt(input: BuildFileSelectionPromptInput) {
  return {
    system: [
      `DoneCheck phase 3 file selection prompt ${FILE_SELECTION_PROMPT_VERSION}.`,
      "Select candidate implementation files for later semantic analysis.",
      "Recall is more important than precision.",
      "Return only structured data matching the schema: candidateFiles, reasoningSummary, confidence, warnings.",
      "Do not make final completion judgements.",
    ].join("\n"),
    user: JSON.stringify(
      {
        claim: input.claim,
        outputContract: {
          candidateFiles: "string[]",
          confidence: "number between 0 and 1, optional",
          reasoningSummary: "short string, optional",
          warnings: "string[]",
        },
        requirement: input.requirement,
        staticSignals: input.staticSignals ?? [],
        structureSummary: input.structureSummary,
        topK: input.topK,
      },
      null,
      2,
    ),
    version: FILE_SELECTION_PROMPT_VERSION,
  };
}
