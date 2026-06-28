import { z } from "zod";

// Stage 4 report contracts live in `@donecheck/shared` so that consumers
// (report-ui, future GUI, export tooling) can `import type` the authoritative
// report shape without taking a runtime dependency on `core`. We re-export
// them here so existing imports from `../semantic/schema.js` keep working.
export {
  judgementDraftSchema,
  semanticEvidenceRefSchema,
  semanticJudgementDraftSchema,
  staticSignalSchema,
} from "@donecheck/shared";

export type {
  JudgementDraft,
  SemanticEvidenceRef,
  SemanticJudgementDraft,
  StaticSignal,
} from "@donecheck/shared";

const nonEmptyTrimmedString = z.string().trim().min(1);

export const fileSelectionModelOutputSchema = z.object({
  candidateFiles: z.array(nonEmptyTrimmedString),
  confidence: z.number().min(0).max(1).optional(),
  reasoningSummary: z.string().trim().optional(),
  warnings: z.array(z.string().trim()).default([]),
});

export type FileSelectionModelOutput = z.infer<typeof fileSelectionModelOutputSchema>;

export const fileSelectionResultSchema = z.object({
  candidateFiles: z.array(nonEmptyTrimmedString),
  confidence: z.number().min(0).max(1).optional(),
  llmSelected: z.array(nonEmptyTrimmedString),
  providerMetadata: z.object({
    model: nonEmptyTrimmedString,
    provider: nonEmptyTrimmedString,
    retries: z.number().int().min(0),
  }),
  reasoningSummary: z.string().trim().optional(),
  staticallyRecalled: z.array(nonEmptyTrimmedString),
  usage: z.object({
    inputTokens: z.number().int().min(0).optional(),
    outputTokens: z.number().int().min(0).optional(),
    totalTokens: z.number().int().min(0).optional(),
  }),
  warnings: z.array(z.string().trim()),
});

export type FileSelectionResult = z.infer<typeof fileSelectionResultSchema>;

export const semanticRequirementSchema = z.object({
  id: nonEmptyTrimmedString,
  text: nonEmptyTrimmedString,
});

export type SemanticRequirement = z.infer<typeof semanticRequirementSchema>;

export const semanticClaimSchema = z.object({
  id: nonEmptyTrimmedString,
  text: nonEmptyTrimmedString,
});

export type SemanticClaim = z.infer<typeof semanticClaimSchema>;

export const evidenceSnippetSchema = z.object({
  filePath: nonEmptyTrimmedString,
  id: nonEmptyTrimmedString,
  lineEnd: z.number().int().positive(),
  lineStart: z.number().int().positive(),
  summary: nonEmptyTrimmedString,
  text: nonEmptyTrimmedString,
});

export type EvidenceSnippet = z.infer<typeof evidenceSnippetSchema>;

export const candidateFileMetadataSchema = z.object({
  filePath: nonEmptyTrimmedString,
  recallSource: z.enum(["llmSelected", "staticallyRecalled"]),
});

export type CandidateFileMetadata = z.infer<typeof candidateFileMetadataSchema>;
