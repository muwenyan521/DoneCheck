import type { Locale } from "../ipc-contract.js";

interface AnalysisStatusCopyInput {
  readonly canAnalyze: boolean;
  readonly locale: Locale;
  readonly notice: string;
}

export function getAnalysisStatusText(input: AnalysisStatusCopyInput): string {
  if (input.notice) return input.notice;
  if (input.canAnalyze) {
    return input.locale === "zh-CN" ? "已准备好，可以开始分析。" : "Ready to start analysis.";
  }
  return input.locale === "zh-CN"
    ? "选择项目目录并填写需求后开始分析。"
    : "Select a project folder and describe the requirement to begin.";
}
