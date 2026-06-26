import { describe, expect, it } from "vitest";
import { ReportSummary } from "./index.js";

describe("ReportSummary", () => {
  it("creates a React element for a DoneCheck result", () => {
    const element = ReportSummary({
      result: {
        checkedAt: "2026-06-26T00:00:00.000Z",
        passed: true,
        summary: "Evidence found.",
      },
    });

    expect(element.type).toBe("section");
  });
});
