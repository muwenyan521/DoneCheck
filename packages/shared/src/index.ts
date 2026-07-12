import { z } from "zod";

const nonEmptyTrimmedString = z.string().trim().min(1);

export const checkStatusSchema = z.enum(["pass", "fail", "partial"]);

export type CheckStatus = z.infer<typeof checkStatusSchema>;

export const requirementSchema = z.object({
  id: nonEmptyTrimmedString,
  text: nonEmptyTrimmedString,
});

export type Requirement = z.infer<typeof requirementSchema>;

export function parseRequirement(requirement: unknown): Requirement {
  return requirementSchema.parse(requirement);
}

export function safeParseRequirement(
  requirement: unknown,
): z.SafeParseReturnType<unknown, Requirement> {
  return requirementSchema.safeParse(requirement);
}

export const evidenceSchema = z.object({
  id: nonEmptyTrimmedString,
  source: nonEmptyTrimmedString,
  text: nonEmptyTrimmedString,
});

export type Evidence = z.infer<typeof evidenceSchema>;

export function parseEvidence(evidence: unknown): Evidence {
  return evidenceSchema.parse(evidence);
}

export function safeParseEvidence(evidence: unknown): z.SafeParseReturnType<unknown, Evidence> {
  return evidenceSchema.safeParse(evidence);
}

export const checkSchema = z.object({
  description: nonEmptyTrimmedString,
  id: nonEmptyTrimmedString,
});

export type Check = z.infer<typeof checkSchema>;

export function parseCheck(check: unknown): Check {
  return checkSchema.parse(check);
}

export function safeParseCheck(check: unknown): z.SafeParseReturnType<unknown, Check> {
  return checkSchema.safeParse(check);
}

export const checkResultSchema = z.object({
  checkId: nonEmptyTrimmedString,
  message: nonEmptyTrimmedString,
  score: z.number().min(0).max(1),
  status: checkStatusSchema,
});

export type CheckResult = z.infer<typeof checkResultSchema>;

export function parseCheckResult(checkResult: unknown): CheckResult {
  return checkResultSchema.parse(checkResult);
}

export function safeParseCheckResult(
  checkResult: unknown,
): z.SafeParseReturnType<unknown, CheckResult> {
  return checkResultSchema.safeParse(checkResult);
}

export const doneCheckResultSchema = z.object({
  checkResults: z.array(checkResultSchema).min(1),
  checkedAt: z.string().datetime(),
  score: z.number().min(0).max(1),
  status: checkStatusSchema,
  summary: nonEmptyTrimmedString,
});

export type DoneCheckResult = z.infer<typeof doneCheckResultSchema>;

export function parseDoneCheckResult(result: unknown): DoneCheckResult {
  return doneCheckResultSchema.parse(result);
}

export function safeParseDoneCheckResult(
  result: unknown,
): z.SafeParseReturnType<unknown, DoneCheckResult> {
  return doneCheckResultSchema.safeParse(result);
}

/**
 * Report template contracts.
 *
 * The authoritative `reportTemplateSchema` lives in `@donecheck/shared` so
 * that `@donecheck/templates` (zero-runtime-dep leaf) and
 * `@donecheck/report-ui` can `import type` the same shape without diverging.
 * The literal unions (`ReportTemplateId`, etc.) are also owned here so a
 * rename or new template id propagates to every consumer at compile time.
 */
export const reportTemplateIdSchema = z.enum(["frontend", "generic", "todo"]);
export type ReportTemplateId = z.infer<typeof reportTemplateIdSchema>;

export const reportTemplateScenarioSchema = z.enum(["form", "frontend", "generic", "todo"]);
export type ReportTemplateScenario = z.infer<typeof reportTemplateScenarioSchema>;

export const reportTemplateSectionSchema = z.enum(["judgements", "overview", "risk-highlights"]);
export type ReportTemplateSection = z.infer<typeof reportTemplateSectionSchema>;

export const reportTemplateFinalStatusSchema = z.enum([
  "extra-scope",
  "fulfilled",
  "insufficient-evidence",
  "partial",
  "suspicious-fake-implementation",
  "unfulfilled",
]);
export type ReportTemplateFinalStatus = z.infer<typeof reportTemplateFinalStatusSchema>;

export const reportTemplateReasonCodeSchema = z.enum([
  "extra-scope-detected",
  "fake-implementation-signal-detected",
  "missing-semantic-draft",
  "semantic-fulfilled-with-incomplete-evidence",
  "semantic-fulfilled-with-strong-evidence",
  "semantic-partial-with-supporting-evidence",
  "semantic-unsupported-without-static-support",
  "suspicious-without-confirmed-fake-signal",
  "weak-or-unstable-evidence",
]);
export type ReportTemplateReasonCode = z.infer<typeof reportTemplateReasonCodeSchema>;

export const reportTemplateSchema = z.object({
  checks: z.array(z.string().trim().min(1)).optional(),
  descriptionKey: nonEmptyTrimmedString,
  highlights: z.object({
    reasonCodes: z.array(reportTemplateReasonCodeSchema),
    statuses: z.array(reportTemplateFinalStatusSchema),
  }),
  id: reportTemplateIdSchema,
  layout: z.object({
    defaultCollapsedSections: z.array(reportTemplateSectionSchema),
    sections: z.array(reportTemplateSectionSchema),
  }),
  nameKey: nonEmptyTrimmedString,
  scenarios: z.array(reportTemplateScenarioSchema),
});

export type ReportTemplate = z.infer<typeof reportTemplateSchema>;

export function parseReportTemplate(template: unknown): ReportTemplate {
  return reportTemplateSchema.parse(template);
}

export const DONECHECK_SCHEMA_VERSION = "0.0.0";

/**
 * Shared report contracts.
 *
 * These schemas and types describe the stable output shape of the rules
 * engine (`@donecheck/core/rules`). They live in `shared` so that consumers
 * (report-ui, future GUI, export tooling) can `import type` the authoritative
 * report structure without taking a runtime dependency on `core`. The rules
 * engine imports these back, which means any change to the report shape is
 * propagated to every consumer at compile time.
 */

export const staticSignalSchema = z.object({
  filePath: nonEmptyTrimmedString,
  keyword: nonEmptyTrimmedString,
  strength: z.enum(["weak", "medium", "strong"]),
});

export type StaticSignal = z.infer<typeof staticSignalSchema>;

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

export const consolidatedRepairPromptSchema = z.object({
  content: z.object({
    "zh-CN": nonEmptyTrimmedString,
    en: nonEmptyTrimmedString,
  }),
  includedJudgementIds: z.array(nonEmptyTrimmedString),
  version: nonEmptyTrimmedString,
});

export type ConsolidatedRepairPrompt = z.infer<typeof consolidatedRepairPromptSchema>;

export const judgementReportSchema = z.object({
  claimCoverage: coverageResultSchema,
  consolidatedRepairPrompt: consolidatedRepairPromptSchema,
  generatedAt: z.string().datetime(),
  judgements: z.array(finalJudgementSchema),
  requirementCoverage: coverageResultSchema,
  scopeDrift: scopeDriftSchema,
  summaryStats: summaryStatsSchema,
  version: z.literal(RULE_ENGINE_VERSION),
  warnings: z.array(nonEmptyTrimmedString),
});

export type JudgementReport = z.infer<typeof judgementReportSchema>;
