import type { DesktopApi, JudgementReport, Locale } from "../ipc-contract.js";
import { getDesktopOperationFeedback } from "./desktop-operation-feedback.js";

export type RepairPromptCopyFeedback =
  | { readonly kind: "success"; readonly message: string }
  | { readonly kind: "error" | "empty"; readonly message: string };

export async function copyRepairPrompt({
  api,
  locale,
  report,
}: {
  readonly api: DesktopApi | undefined;
  readonly locale: Locale;
  readonly report: JudgementReport;
}): Promise<RepairPromptCopyFeedback> {
  const text = report.consolidatedRepairPrompt.content[locale];
  if (text.trim().length === 0) {
    return { kind: "empty", message: copyMessage(locale, "empty") };
  }
  if (api === undefined) {
    return { kind: "error", message: getDesktopOperationFeedback(locale, "copy-fix-instructions") };
  }
  const result = await api.copyRepairPrompt({ text });
  return result.ok
    ? { kind: "success", message: copyMessage(locale, "success") }
    : { kind: "error", message: getDesktopOperationFeedback(locale, "copy-fix-instructions") };
}

function copyMessage(locale: Locale, kind: "empty" | "success"): string {
  const messages = {
    en: {
      empty: "No fix instructions are available to copy.",
      success: "Fix instructions copied.",
    },
    "zh-CN": {
      empty: "暂无可复制的修复建议。",
      success: "修复建议已复制。",
    },
  } as const;
  return messages[locale][kind];
}
