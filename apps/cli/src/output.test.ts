import type { DoneCheckResult } from "@donecheck/shared";
import { describe, expect, it } from "vitest";
import { formatHumanResult, formatJsonResult } from "./output.js";

describe("output formatting", () => {
  it("formats human-readable results with status, score, checks, and summary", () => {
    const output = formatHumanResult(result);

    expect(output).toContain("Status: partial");
    expect(output).toContain("Score: 67%");
    expect(output).toContain("Checks:");
    expect(output).toContain("- [pass] requirement-present (100%): Requirement text is present.");
    expect(output).toContain(
      "- [partial] keyword-coverage (50%): Evidence covers 1 of 2 requirement keywords.",
    );
    expect(output).toContain("Summary: DoneCheck summary.");
  });

  it("formats JSON results without changing the object shape", () => {
    expect(formatJsonResult(result)).toBe(`${JSON.stringify(result, null, 2)}\n`);
  });
});

const result: DoneCheckResult = {
  checkedAt: "2026-06-27T08:00:00.000Z",
  checkResults: [
    {
      checkId: "requirement-present",
      message: "Requirement text is present.",
      score: 1,
      status: "pass",
    },
    {
      checkId: "keyword-coverage",
      message: "Evidence covers 1 of 2 requirement keywords.",
      score: 0.5,
      status: "partial",
    },
  ],
  score: 0.67,
  status: "partial",
  summary: "DoneCheck summary.",
};
