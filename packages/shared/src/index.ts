import { z } from "zod";

export const doneCheckResultSchema = z.object({
  passed: z.boolean(),
  summary: z.string(),
  checkedAt: z.string().datetime(),
});

export type DoneCheckResult = z.infer<typeof doneCheckResultSchema>;

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
