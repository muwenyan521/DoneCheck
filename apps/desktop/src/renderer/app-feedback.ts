import type { Locale } from "../ipc-contract.js";

type Setter = (value: string) => void;

export function applyUserInput(input: {
  readonly setNotice: Setter;
  readonly setValue: Setter;
  readonly value: string;
}): void {
  input.setValue(input.value);
  input.setNotice("");
}

export async function saveHistoryWithFeedback(input: {
  readonly locale: Locale;
  readonly persist: () => Promise<boolean>;
  readonly setNotice: Setter;
}): Promise<boolean> {
  input.setNotice(input.locale === "zh-CN" ? "正在保存..." : "Saving...");
  const saved = await input.persist();
  if (!saved) return false;
  input.setNotice(input.locale === "zh-CN" ? "报告已保存。" : "Report saved.");
  return true;
}
