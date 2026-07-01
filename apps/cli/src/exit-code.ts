import type { JudgementReport } from "@donecheck/core";

export const toolErrorExitCode = 2;

export type CliCheckStatus = "pass" | "partial" | "fail";

export function exitCodeForResult(status: CliCheckStatus, partialOk: boolean): number {
  if (status === "pass") return 0;
  if (status === "partial" && partialOk) return 0;
  return 1;
}

export function exitCodeForJudgementReport(report: JudgementReport, partialOk: boolean): number {
  const stats = report.summaryStats;
  if (
    stats.unfulfilled > 0 ||
    stats["suspicious-fake-implementation"] > 0 ||
    stats["extra-scope"] > 0
  ) {
    return 1;
  }
  if (stats.partial > 0 || stats["insufficient-evidence"] > 0) {
    return partialOk ? 0 : 1;
  }
  return 0;
}
