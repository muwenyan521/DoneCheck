import type { DoneCheckResult } from "@donecheck/shared";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { ReportSummary } from "./index.js";

const baseResult: DoneCheckResult = {
  checkedAt: "2026-06-26T00:00:00.000Z",
  checkResults: [
    {
      checkId: "evidence-present",
      message: "Evidence text is present.",
      score: 1,
      status: "pass",
    },
  ],
  score: 1,
  status: "pass",
  summary: "Evidence found.",
};

describe("ReportSummary", () => {
  it("renders passed status, summary, and checked time", () => {
    const element = ReportSummary({ result: baseResult });

    expect(element.type).toBe("section");
    expect(element.props["aria-label"]).toBe("DoneCheck report summary");
    expect(element.props.children.map((child: ReactElement) => child.props.children)).toEqual([
      "Passed",
      "Evidence found.",
      "2026-06-26T00:00:00.000Z",
    ]);
    expect(element.props.children.at(2).props.dateTime).toBe("2026-06-26T00:00:00.000Z");
  });

  it("renders non-pass status as needing work", () => {
    const element = ReportSummary({
      result: {
        ...baseResult,
        score: 0,
        status: "fail",
        summary: "Evidence missing.",
      },
    });

    expect(element.props.children.map((child: ReactElement) => child.props.children)).toEqual([
      "Needs work",
      "Evidence missing.",
      "2026-06-26T00:00:00.000Z",
    ]);
  });
});
