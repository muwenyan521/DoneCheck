/**
 * DoneCheck templates package.
 *
 * Per the dependency铁律, `@donecheck/templates` is a zero-runtime-dependency
 * leaf package: it only exports static template data and a plain TypeScript
 * interface. Template schema validation (zod) lives in `@donecheck/shared`,
 * which already depends on zod, so importing `validateTemplate` from
 * `@donecheck/shared` keeps the validation logic with the shared schemas.
 */
export interface DoneCheckTemplate {
  checks: string[];
  id: string;
  name: string;
}

export const defaultTemplate: DoneCheckTemplate = {
  checks: ["Evidence demonstrates the requested behavior."],
  id: "default",
  name: "Default DoneCheck template",
};
