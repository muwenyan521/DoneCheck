import { describe, expect, it } from "vitest";
import {
  checkResultSchema,
  checkSchema,
  doneCheckResultSchema,
  evidenceSchema,
  parseCheck,
  parseCheckResult,
  parseDoneCheckResult,
  parseEvidence,
  parseRequirement,
  requirementSchema,
  safeParseCheck,
  safeParseCheckResult,
  safeParseDoneCheckResult,
  safeParseEvidence,
  safeParseRequirement,
  templateSchema,
  validateTemplate,
} from "./index.js";

const validRequirement = {
  id: "req-1",
  text: "Implement shared contracts and a core analysis skeleton.",
};

const validEvidence = {
  id: "ev-1",
  source: "test-output",
  text: "The implementation includes shared contracts, core analysis, tests, and build output.",
};

const validCheck = {
  description: "Evidence must be present.",
  id: "evidence-present",
};

const validCheckResult = {
  checkId: "evidence-present",
  message: "Evidence is present.",
  score: 1,
  status: "pass" as const,
};

const validDoneCheckResult = {
  checkedAt: "1970-01-01T00:00:00.000Z",
  checkResults: [validCheckResult],
  score: 1,
  status: "pass" as const,
  summary: "All checks passed.",
};

describe("requirementSchema", () => {
  it("accepts and parses a valid requirement", () => {
    expect(parseRequirement(validRequirement)).toEqual(validRequirement);
    expect(safeParseRequirement(validRequirement).success).toBe(true);
  });

  it("rejects an empty requirement text", () => {
    expect(() => requirementSchema.parse({ id: "req-1", text: "   " })).toThrow();
    expect(safeParseRequirement({ id: "req-1", text: "" }).success).toBe(false);
  });
});

describe("evidenceSchema", () => {
  it("accepts and parses a valid evidence item", () => {
    expect(parseEvidence(validEvidence)).toEqual(validEvidence);
    expect(safeParseEvidence(validEvidence).success).toBe(true);
  });

  it("rejects an evidence item without text", () => {
    expect(() => evidenceSchema.parse({ id: "ev-1", source: "test-output", text: "" })).toThrow();
    expect(safeParseEvidence({ id: "ev-1", source: "test-output" }).success).toBe(false);
  });
});

describe("checkSchema", () => {
  it("accepts and parses a valid check contract", () => {
    expect(parseCheck(validCheck)).toEqual(validCheck);
    expect(safeParseCheck(validCheck).success).toBe(true);
  });

  it("rejects a check without an id", () => {
    expect(() => checkSchema.parse({ description: "Evidence must be present." })).toThrow();
    expect(safeParseCheck({ id: "", description: "Evidence must be present." }).success).toBe(
      false,
    );
  });
});

describe("checkResultSchema", () => {
  it("accepts and parses a valid check result", () => {
    expect(parseCheckResult(validCheckResult)).toEqual(validCheckResult);
    expect(safeParseCheckResult(validCheckResult).success).toBe(true);
  });

  it("rejects a check result with an invalid status or score", () => {
    expect(() =>
      checkResultSchema.parse({
        checkId: "evidence-present",
        message: "Invalid.",
        score: 1.2,
        status: "unknown",
      }),
    ).toThrow();
    expect(
      safeParseCheckResult({
        checkId: "evidence-present",
        message: "Invalid.",
        score: -0.1,
        status: "fail",
      }).success,
    ).toBe(false);
  });
});

describe("doneCheckResultSchema", () => {
  it("accepts and parses a valid structured analysis result", () => {
    const parsed = parseDoneCheckResult(validDoneCheckResult);

    expect(parsed).toEqual(validDoneCheckResult);
    expect(safeParseDoneCheckResult(validDoneCheckResult).success).toBe(true);
  });

  it("rejects invalid status and empty check results", () => {
    expect(() =>
      doneCheckResultSchema.parse({
        checkedAt: "2026-06-26T00:00:00.000Z",
        checkResults: [],
        score: 0.5,
        status: "unknown",
        summary: "Invalid result.",
      }),
    ).toThrow();
    expect(
      safeParseDoneCheckResult({
        checkedAt: "not-a-date",
        checkResults: [validCheckResult],
        score: 0.5,
        status: "partial",
        summary: "Invalid date.",
      }).success,
    ).toBe(false);
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
