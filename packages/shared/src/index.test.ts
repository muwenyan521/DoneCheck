import { describe, expect, it } from "vitest";
import { doneCheckResultSchema, templateSchema, validateTemplate } from "./index.js";

describe("doneCheckResultSchema", () => {
  it("accepts a minimal valid analysis result", () => {
    const parsed = doneCheckResultSchema.parse({
      checkedAt: "2026-06-26T00:00:00.000Z",
      passed: true,
      summary: "All checks passed.",
    });

    expect(parsed.passed).toBe(true);
  });
});

describe("templateSchema / validateTemplate", () => {
  it("accepts a valid template", () => {
    const valid = {
      checks: ["Evidence demonstrates the requested behavior."],
      id: "default",
      name: "Default DoneCheck template",
    };

    expect(validateTemplate(valid)).toEqual(valid);
  });

  it("rejects a template with an empty checks array", () => {
    expect(() =>
      templateSchema.parse({
        checks: [],
        id: "default",
        name: "Default DoneCheck template",
      }),
    ).toThrow();
  });

  it("rejects a template missing required fields", () => {
    expect(() => templateSchema.parse({ id: "default" })).toThrow();
  });
});
