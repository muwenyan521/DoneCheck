import type { JudgementReport } from "@donecheck/shared";
import { describe, expect, it } from "vitest";
import { exitCodeForJudgementReport, exitCodeForResult, toolErrorExitCode } from "./exit-code.js";

describe("exit codes", () => {
  it("maps pass to success", () => {
    expect(exitCodeForResult("pass", false)).toBe(0);
  });

  it("maps fail to check failure", () => {
    expect(exitCodeForResult("fail", false)).toBe(1);
  });

  it("maps partial to check failure by default", () => {
    expect(exitCodeForResult("partial", false)).toBe(1);
  });

  it("maps partial to success when partial-ok is enabled", () => {
    expect(exitCodeForResult("partial", true)).toBe(0);
  });

  it("uses exit code 2 for tool errors", () => {
    expect(toolErrorExitCode).toBe(2);
  });
});

describe("exitCodeForJudgementReport", () => {
  const base = (status: keyof JudgementReport["summaryStats"]) =>
    ({
      summaryStats: {
        "extra-scope": 0,
        fulfilled: 0,
        "insufficient-evidence": 0,
        partial: 0,
        "suspicious-fake-implementation": 0,
        unfulfilled: 0,
        [status]: 1,
      },
    }) as unknown as JudgementReport;

  it("returns 0 when all fulfilled", () => {
    expect(exitCodeForJudgementReport(base("fulfilled"), false)).toBe(0);
  });

  it("returns 1 when unfulfilled", () => {
    expect(exitCodeForJudgementReport(base("unfulfilled"), false)).toBe(1);
  });

  it("returns 1 when suspicious-fake-implementation", () => {
    expect(exitCodeForJudgementReport(base("suspicious-fake-implementation"), false)).toBe(1);
  });

  it("returns 1 when extra-scope", () => {
    expect(exitCodeForJudgementReport(base("extra-scope"), false)).toBe(1);
  });

  it("returns 0 for partial with --partial-ok", () => {
    expect(exitCodeForJudgementReport(base("partial"), true)).toBe(0);
  });

  it("returns 1 for partial without --partial-ok", () => {
    expect(exitCodeForJudgementReport(base("partial"), false)).toBe(1);
  });

  it("returns 1 for insufficient-evidence without --partial-ok", () => {
    expect(exitCodeForJudgementReport(base("insufficient-evidence"), false)).toBe(1);
  });

  it("returns 0 for insufficient-evidence with --partial-ok", () => {
    expect(exitCodeForJudgementReport(base("insufficient-evidence"), true)).toBe(0);
  });
});
