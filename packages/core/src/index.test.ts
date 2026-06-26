import type { Evidence, Requirement } from "@donecheck/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyze,
  coverageKeywordsCheck,
  defaultChecks,
  evidencePresentCheck,
  requirementPresentCheck,
} from "./index.js";

const requirement: Requirement = {
  id: "req-1",
  text: "Implement shared contracts and core analysis tests.",
};

const coveringEvidence: Evidence = {
  id: "ev-1",
  source: "test-output",
  text: "The shared contracts, core analysis, and tests implement verified coverage.",
};

describe("analyze", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-26T12:34:56.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns pass when evidence is present and covers requirement keywords", () => {
    const result = analyze({
      evidence: coveringEvidence,
      requirement,
    });

    expect(result).toEqual({
      checkedAt: "2026-06-26T12:34:56.000Z",
      checkResults: [
        {
          checkId: "requirement-present",
          message: "Requirement text is present.",
          score: 1,
          status: "pass",
        },
        {
          checkId: "evidence-present",
          message: "Evidence text is present.",
          score: 1,
          status: "pass",
        },
        {
          checkId: "keyword-coverage",
          message: "Evidence covers 6 of 6 requirement keywords.",
          score: 1,
          status: "pass",
        },
      ],
      score: 1,
      status: "pass",
      summary: "DoneCheck 0.0.0: 3 checks passed, 0 partial, 0 failed. Overall score 100%.",
    });
  });

  it("returns pass for string inputs that cover requirement keywords", () => {
    const result = analyze({
      evidence: "The shared contracts, core analysis, and tests implement verified coverage.",
      requirement: "Implement shared contracts and core analysis tests.",
    });

    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
    expect(result.checkedAt).toBe("2026-06-26T12:34:56.000Z");
  });

  it("returns fail when requirement and evidence are blank strings", () => {
    const result = analyze({
      evidence: "   ",
      requirement: "   ",
    });

    expect(result.status).toBe("fail");
    expect(result.score).toBe(0);
    expect(result.checkResults.map((checkResult) => checkResult.status)).toEqual([
      "fail",
      "fail",
      "fail",
    ]);
  });

  it("returns partial when evidence is present but covers only some requirement keywords", () => {
    const result = analyze({
      evidence: {
        id: "ev-1",
        source: "test-output",
        text: "The implementation includes shared contracts only.",
      },
      requirement,
    });

    expect(result.status).toBe("partial");
    expect(result.score).toBeCloseTo(0.78, 2);
    expect(result.checkResults.at(2)).toEqual({
      checkId: "keyword-coverage",
      message: "Evidence covers 2 of 6 requirement keywords.",
      score: 0.33,
      status: "partial",
    });
  });

  it("accepts evidence arrays and scores coverage across all items", () => {
    const result = analyze({
      evidence: [
        { id: "ev-1", source: "test-output", text: "Shared contracts are complete." },
        { id: "ev-2", source: "test-output", text: "Core analysis tests implement coverage." },
      ],
      requirement,
    });

    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
    expect(result.checkResults.at(2)).toEqual({
      checkId: "keyword-coverage",
      message: "Evidence covers 6 of 6 requirement keywords.",
      score: 1,
      status: "pass",
    });
  });

  it("rejects invalid structured requirements instead of normalizing them", () => {
    expect(() =>
      analyze({
        evidence: coveringEvidence,
        requirement: { id: "", text: "Implement shared contracts." },
      }),
    ).toThrow();
  });

  it("rejects invalid structured evidence instead of normalizing it", () => {
    expect(() =>
      analyze({
        evidence: { id: "", source: "", text: "Shared contracts are implemented." },
        requirement,
      }),
    ).toThrow();
  });
});

describe("defaultChecks", () => {
  it("registers the phase 1 checks in deterministic order", () => {
    expect(defaultChecks.map((check) => check.id)).toEqual([
      "requirement-present",
      "evidence-present",
      "keyword-coverage",
    ]);
  });
});

describe("requirementPresentCheck", () => {
  it("fails when the requirement text is empty", () => {
    expect(
      requirementPresentCheck.run({
        evidence: [coveringEvidence],
        requirement: { id: "req-1", text: "" },
      }),
    ).toEqual({
      checkId: "requirement-present",
      message: "Requirement text is required.",
      score: 0,
      status: "fail",
    });
  });
});

describe("evidencePresentCheck", () => {
  it("passes when at least one evidence item has text", () => {
    expect(
      evidencePresentCheck.run({
        evidence: [{ id: "ev-empty", source: "test-output", text: "" }, coveringEvidence],
        requirement,
      }),
    ).toEqual({
      checkId: "evidence-present",
      message: "Evidence text is present.",
      score: 1,
      status: "pass",
    });
  });
});

describe("coverageKeywordsCheck", () => {
  it("fails when no meaningful requirement keywords are covered", () => {
    expect(
      coverageKeywordsCheck.run({
        evidence: [
          {
            id: "ev-1",
            source: "test-output",
            text: "Unrelated release notes.",
          },
        ],
        requirement,
      }),
    ).toEqual({
      checkId: "keyword-coverage",
      message: "Evidence covers 0 of 6 requirement keywords.",
      score: 0,
      status: "fail",
    });
  });

  it("does not count Latin substrings as whole keyword coverage", () => {
    expect(
      coverageKeywordsCheck.run({
        evidence: [
          {
            id: "ev-1",
            source: "test-output",
            text: "The implementation stores categories.",
          },
        ],
        requirement: { id: "req-1", text: "Implement cat mode." },
      }),
    ).toEqual({
      checkId: "keyword-coverage",
      message: "Evidence covers 0 of 2 requirement keywords.",
      score: 0,
      status: "fail",
    });
  });
});
