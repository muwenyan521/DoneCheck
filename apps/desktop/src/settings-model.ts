import type { Locale, ReportTemplateId } from "./ipc-contract.js";

export type ProviderMode = "bundled-free" | "mock" | "openai-compatible";

export interface DesktopSettings {
  readonly providerMode: ProviderMode;
  readonly providerBaseUrl: string;
  readonly providerModel: string;
  readonly topK: number;
  readonly ignore: readonly string[];
  readonly confirmRequirementDecomposition: boolean;
  readonly locale: Locale;
  readonly templateId: ReportTemplateId;
  readonly defaultWorkspaceDir: string | null;
  readonly autoSaveHistory: boolean;
  readonly reopenLastWorkspace: boolean;
  readonly recentWorkspaces: readonly string[];
}

export type DesktopSettingsPatch = Partial<DesktopSettings>;

export const defaultDesktopSettings: DesktopSettings = {
  autoSaveHistory: false,
  confirmRequirementDecomposition: false,
  defaultWorkspaceDir: null,
  ignore: [],
  locale: "zh-CN",
  providerBaseUrl: "",
  providerMode: "bundled-free",
  providerModel: "",
  recentWorkspaces: [],
  reopenLastWorkspace: false,
  templateId: "generic",
  topK: 5,
};
