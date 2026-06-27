import type { CliCheckStatus } from "./exit-code.js";

export interface CliResultView {
  readonly checkResults: readonly {
    readonly checkId: string;
    readonly message: string;
    readonly score: number;
    readonly status: CliCheckStatus;
  }[];
  readonly score: number;
  readonly status: CliCheckStatus;
  readonly summary: string;
}

export function formatHumanResult(result: CliResultView): string {
  const lines = [
    "DoneCheck Result",
    `Status: ${result.status}`,
    `Score: ${formatPercent(result.score)}`,
    "Checks:",
    ...result.checkResults.map(
      (checkResult) =>
        `- [${checkResult.status}] ${checkResult.checkId} (${formatPercent(checkResult.score)}): ${checkResult.message}`,
    ),
    `Summary: ${result.summary}`,
  ];

  return `${lines.join("\n")}\n`;
}

export function formatJsonResult(result: CliResultView): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

function formatPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}
