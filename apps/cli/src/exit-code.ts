export const toolErrorExitCode = 2;

export type CliCheckStatus = "pass" | "partial" | "fail";

export function exitCodeForResult(status: CliCheckStatus, partialOk: boolean): number {
  if (status === "pass") return 0;
  if (status === "partial" && partialOk) return 0;
  return 1;
}
