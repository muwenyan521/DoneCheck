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
 * Template schema + validation. Previously lived in `@donecheck/templates`,
 * but was moved here so `@donecheck/templates` can remain a
 * zero-runtime-dependency leaf package (static data only).
 */
export const templateSchema = z.object({
  checks: z.array(z.string().min(1)).min(1),
  id: z.string().min(1),
  name: z.string().min(1),
});

export type DoneCheckTemplate = z.infer<typeof templateSchema>;

export function validateTemplate(template: unknown): DoneCheckTemplate {
  return templateSchema.parse(template);
}

export const DONECHECK_SCHEMA_VERSION = "0.0.0";
