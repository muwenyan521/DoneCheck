export type ModelOutputLanguage = "en" | "zh-CN";

export function resolveModelOutputLanguage(
  language: ModelOutputLanguage | undefined,
): ModelOutputLanguage {
  return language ?? "en";
}
