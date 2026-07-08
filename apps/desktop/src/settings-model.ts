import type { Locale, ReportTemplateId } from "./ipc-contract.js";

export type ProviderMode = "mock" | "openai-compatible";

export interface DesktopSettings {
  readonly providerMode: ProviderMode;
  readonly providerBaseUrl: string;
  readonly providerModel: string;
  readonly structuredOutputStrict: boolean;
  readonly topK: number;
  readonly ignore: readonly string[];
  readonly confirmRequirementDecomposition: boolean;
  readonly locale: Locale;
  readonly templateId: ReportTemplateId;
  readonly showDebugSections: boolean;
  readonly defaultWorkspaceDir: string | null;
  readonly autoSaveHistory: boolean;
  readonly reopenLastWorkspace: boolean;
  readonly recentWorkspaces: readonly string[];
}

export type DesktopSettingsPatch = Partial<DesktopSettings>;

export const defaultDesktopSettings: DesktopSettings = {
  autoSaveHistory: true,
  confirmRequirementDecomposition: false,
  defaultWorkspaceDir: null,
  ignore: [],
  locale: "zh-CN",
  providerBaseUrl: "",
  providerMode: "mock",
  providerModel: "",
  recentWorkspaces: [],
  reopenLastWorkspace: false,
  showDebugSections: false,
  structuredOutputStrict: true,
  templateId: "generic",
  topK: 5,
};
