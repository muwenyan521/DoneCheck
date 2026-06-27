import { z } from "zod";

const nonEmptyTrimmedString = z.string().trim().min(1);

export const fileSelectionModelOutputSchema = z.object({
  candidateFiles: z.array(nonEmptyTrimmedString),
  confidence: z.number().min(0).max(1).optional(),
  reasoningSummary: z.string().trim().optional(),
  warnings: z.array(z.string().trim()).default([]),
});

export type FileSelectionModelOutput = z.infer<typeof fileSelectionModelOutputSchema>;

export const staticSignalSchema = z.object({
  filePath: nonEmptyTrimmedString,
  keyword: nonEmptyTrimmedString,
  strength: z.enum(["weak", "medium", "strong"]),
});

export type StaticSignal = z.infer<typeof staticSignalSchema>;

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

export const semanticEvidenceRefSchema = z.object({
  filePath: nonEmptyTrimmedString,
  lineEnd: z.number().int().positive(),
  lineStart: z.number().int().positive(),
  snippetSummary: nonEmptyTrimmedString,
});

export type SemanticEvidenceRef = z.infer<typeof semanticEvidenceRefSchema>;

export const judgementDraftSchema = z.enum(["fulfilled", "partial", "unsupported", "suspicious"]);

export type JudgementDraft = z.infer<typeof judgementDraftSchema>;

export const semanticJudgementDraftSchema = z.object({
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(semanticEvidenceRefSchema).min(1),
  explanation: nonEmptyTrimmedString,
  judgementDraft: judgementDraftSchema,
  matchedClaimId: nonEmptyTrimmedString.optional(),
  matchedRequirementId: nonEmptyTrimmedString.optional(),
  possibleExtraScope: z.array(z.string().trim().min(1)).optional(),
  repairSuggestion: nonEmptyTrimmedString,
});

export type SemanticJudgementDraft = z.infer<typeof semanticJudgementDraftSchema>;
