import { z } from "zod";
import {
  semanticClaimSchema,
  semanticEvidenceRefSchema,
  semanticJudgementDraftSchema,
  semanticRequirementSchema,
  staticSignalSchema,
} from "../semantic/schema.js";

const nonEmptyTrimmedString = z.string().trim().min(1);

export const RULE_ENGINE_VERSION = "rules-v1";

export const finalJudgementKindSchema = z.enum(["requirement", "claim", "extra-scope"]);

export type FinalJudgementKind = z.infer<typeof finalJudgementKindSchema>;

export const finalStatusSchema = z.enum([
  "fulfilled",
  "partial",
  "insufficient-evidence",
  "unfulfilled",
  "suspicious-fake-implementation",
  "extra-scope",
]);

export type FinalStatus = z.infer<typeof finalStatusSchema>;

export const confidenceLevelSchema = z.enum(["low", "medium", "high"]);

export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

export const reasonCodeSchema = z.enum([
  "extra-scope-detected",
  "fake-implementation-signal-detected",
  "semantic-fulfilled-with-strong-evidence",
  "semantic-fulfilled-with-incomplete-evidence",
  "semantic-partial-with-supporting-evidence",
  "semantic-unsupported-without-static-support",
  "suspicious-without-confirmed-fake-signal",
  "weak-or-unstable-evidence",
  "missing-semantic-draft",
]);

export type ReasonCode = z.infer<typeof reasonCodeSchema>;

export const targetedStaticSignalSchema = staticSignalSchema.extend({
  targetId: nonEmptyTrimmedString.optional(),
  targetKind: finalJudgementKindSchema.exclude(["extra-scope"]).optional(),
});

export type TargetedStaticSignal = z.infer<typeof targetedStaticSignalSchema>;

export const fakeImplementationSignalSchema = z.object({
  filePath: nonEmptyTrimmedString,
  lineEnd: z.number().int().positive().optional(),
  lineStart: z.number().int().positive().optional(),
  pattern: z.enum(["mock", "alert-only", "empty-handler", "not-implemented", "todo", "ui-only"]),
  strength: z.enum(["weak", "medium", "strong"]),
  targetId: nonEmptyTrimmedString.optional(),
  targetKind: finalJudgementKindSchema.exclude(["extra-scope"]).optional(),
});

export type FakeImplementationSignal = z.infer<typeof fakeImplementationSignalSchema>;

export const extraScopeCandidateSchema = z.object({
  evidenceRefs: z.array(semanticEvidenceRefSchema).default([]),
  id: nonEmptyTrimmedString,
  sourceId: nonEmptyTrimmedString,
  summary: nonEmptyTrimmedString,
});

export type ExtraScopeCandidate = z.infer<typeof extraScopeCandidateSchema>;

export const finalJudgementSchema = z.object({
  confidence: z.number().min(0).max(1),
  confidenceLevel: confidenceLevelSchema,
  evidenceRefs: z.array(semanticEvidenceRefSchema),
  explanation: nonEmptyTrimmedString,
  finalStatus: finalStatusSchema,
  id: nonEmptyTrimmedString,
  kind: finalJudgementKindSchema,
  reasonCode: reasonCodeSchema,
  semanticDraft: semanticJudgementDraftSchema.optional(),
  signals: z.object({
    evidenceStrength: z.enum(["none", "weak", "medium", "strong"]),
    fakeImplementationSignals: z.array(fakeImplementationSignalSchema),
    staticSignals: z.array(targetedStaticSignalSchema),
  }),
  sourceId: nonEmptyTrimmedString,
});

export type FinalJudgement = z.infer<typeof finalJudgementSchema>;

export const coverageResultSchema = z.object({
  denominator: z.number().int().min(0),
  excludedInsufficientEvidence: z.number().int().min(0),
  score: z.number().min(0).max(1),
  totalItems: z.number().int().min(0),
  weightedFulfilled: z.number().min(0),
});

export type CoverageResult = z.infer<typeof coverageResultSchema>;

export const scopeDriftSchema = z.object({
  extraScopeCount: z.number().int().min(0),
  level: z.enum(["low", "medium", "high"]),
  score: z.number().min(0).max(1),
});

export type ScopeDrift = z.infer<typeof scopeDriftSchema>;

export const summaryStatsSchema = z.object({
  "extra-scope": z.number().int().min(0),
  fulfilled: z.number().int().min(0),
  "insufficient-evidence": z.number().int().min(0),
  partial: z.number().int().min(0),
  "suspicious-fake-implementation": z.number().int().min(0),
  unfulfilled: z.number().int().min(0),
});

export type SummaryStats = z.infer<typeof summaryStatsSchema>;

export const judgementReportSchema = z.object({
  claimCoverage: coverageResultSchema,
  generatedAt: z.string().datetime(),
  judgements: z.array(finalJudgementSchema),
  requirementCoverage: coverageResultSchema,
  scopeDrift: scopeDriftSchema,
  summaryStats: summaryStatsSchema,
  version: z.literal(RULE_ENGINE_VERSION),
  warnings: z.array(nonEmptyTrimmedString),
});

export type JudgementReport = z.infer<typeof judgementReportSchema>;

export const evaluateJudgementsInputSchema = z.object({
  claims: z.array(semanticClaimSchema).default([]),
  extraScopeCandidates: z.array(extraScopeCandidateSchema).default([]),
  fakeImplementationSignals: z.array(fakeImplementationSignalSchema).default([]),
  generatedAt: z.string().datetime(),
  requirements: z.array(semanticRequirementSchema).default([]),
  semanticDrafts: z.array(semanticJudgementDraftSchema).default([]),
  staticSignals: z.array(targetedStaticSignalSchema).default([]),
});

export type EvaluateJudgementsInput = z.infer<typeof evaluateJudgementsInputSchema>;

export interface EvaluateFinalJudgementInput {
  readonly extraScopeCandidate?: ExtraScopeCandidate;
  readonly fakeImplementationSignals?: readonly FakeImplementationSignal[];
  readonly item: {
    readonly id: string;
    readonly kind: FinalJudgementKind;
    readonly sourceId: string;
  };
  readonly semanticDraft?: z.infer<typeof semanticJudgementDraftSchema>;
  readonly signals?: readonly TargetedStaticSignal[];
}

export type CoverageInputItem = Pick<FinalJudgement, "finalStatus" | "kind">;
