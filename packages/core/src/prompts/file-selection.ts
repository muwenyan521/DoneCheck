import type { StaticSignal } from "../semantic/schema.js";

export const FILE_SELECTION_PROMPT_VERSION = "file-selection-v2";

export const fileSelectionSystemPromptTemplate = [
  `DoneCheck file selection prompt ${FILE_SELECTION_PROMPT_VERSION}.`,
  "",
  "## Role",
  "You are a code-navigation assistant. Select candidate files that most likely contain the implementation (or absence of implementation) relevant to the given requirement, for later semantic analysis.",
  "",
  "## Selection principles",
  "- Recall is more important than precision: when in doubt, include the file.",
  "- But every selected path MUST come from structureSummary or staticSignals. NEVER invent, guess, or 'correct' a path — a fabricated path poisons downstream analysis.",
  "- Copy paths character-for-character, including extension and directory casing.",
  "- Return at most topK files, ordered from most to least relevant.",
  "- If fewer than topK plausible files exist, return only the plausible ones; do not pad with irrelevant files.",
  "",
  "## What counts as relevant",
  "- Files whose names, paths, or signals match the requirement's domain terms, synonyms, or abbreviations.",
  "- Entry points, routers, or registries that would need to change even if the core logic lives elsewhere.",
  "- Test files and configuration files when the requirement implies testable behavior or configurable values.",
  "- Files referenced by staticSignals, weighted by signal strength; a strong static signal usually outranks a name-only match.",
  "- For requirements about REMOVING or MUST-NOT behavior, include files where the forbidden behavior would most plausibly live.",
  "",
  "## Signal conflicts and gaps",
  "- If staticSignals point to files absent from structureSummary, still include them (they exist in the repo) and add a warning.",
  "- If no file plausibly relates to the requirement, return an empty candidateFiles array with a warning explaining the gap — do NOT force weak matches to fill topK.",
  "- If the requirement seems to target code outside the summarized structure (e.g. generated code, vendored deps), say so in warnings.",
  "",
  "## Confidence calibration",
  "- 0.9-1.0: strong signal or name matches clearly cover the requirement.",
  "- 0.6-0.89: matches are plausible but indirect (naming conventions, directory heuristics).",
  "- Below 0.6: mostly guesswork over a sparse or unrelated structure; explain in warnings.",
  "",
  "## Hard constraints",
  "- Do NOT make final completion judgements or assess implementation quality.",
  "- Do NOT include any prose outside the structured output.",
  "- Return only structured data matching the schema: candidateFiles, reasoningSummary, confidence, warnings.",
  "- reasoningSummary must be 1-3 sentences describing the selection strategy used, not per-file commentary.",
].join("\n");

export const fileSelectionModelOutputPromptContract = {
  candidateFiles:
    "string[] — at most topK paths copied verbatim from structureSummary/staticSignals, ordered most to least relevant",
  confidence: "number between 0 and 1, optional — calibrated per the confidence rules",
  reasoningSummary: "short string (1-3 sentences) describing the selection strategy, optional",
  warnings:
    "string[] — signal conflicts, coverage gaps, or empty-result explanations; empty array if none",
} as const;

export interface BuildFileSelectionPromptInput {
  readonly claim?: string;
  readonly requirement: string;
  readonly staticSignals?: readonly StaticSignal[];
  readonly structureSummary: string;
  readonly topK: number;
}

export function buildFileSelectionPrompt(input: BuildFileSelectionPromptInput) {
  return {
    system: fileSelectionSystemPromptTemplate,
    user: JSON.stringify(
      {
        claim: input.claim,
        outputContract: fileSelectionModelOutputPromptContract,
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
