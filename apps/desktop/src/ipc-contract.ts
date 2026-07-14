import type { JudgementReport } from "@donecheck/core";
import type { ReportTemplateId } from "@donecheck/shared";
import type { CredentialStatus } from "./desktop-provider.js";
import type { ProviderErrorKind } from "./provider-error-kind.js";
import type { DesktopSettings, DesktopSettingsPatch } from "./settings-store.js";

export type { JudgementReport } from "@donecheck/core";
export type { ReportTemplateId } from "@donecheck/shared";
export type { CredentialStatus } from "./desktop-provider.js";
export type { DesktopSettings, DesktopSettingsPatch } from "./settings-store.js";

export type Locale = "en" | "zh-CN";

export const DESKTOP_API_KEYS = [
  "donecheck:decompose",
  "donecheck:analyze",
  "donecheck:cancel-analysis",
  "donecheck:bundled-free:status",
  "donecheck:bundled-free:preflight",
  "donecheck:bundled-free:start-workflow",
  "donecheck:render-html",
  "donecheck:select-workspace",
  "donecheck:export-html",
  "donecheck:history:list",
  "donecheck:history:get",
  "donecheck:history:save",
  "donecheck:history:delete",
  "donecheck:history:restore",
  "donecheck:history:clear",
  "donecheck:settings:get",
  "donecheck:settings:set",
  "donecheck:settings:set-with-session-api-key",
  "donecheck:settings:reset",
  "donecheck:credentials:set-session-api-key",
  "donecheck:credentials:clear-session-api-key",
  "donecheck:credentials:status",
  "donecheck:clipboard:copy-repair-prompt",
] as const;

export type DesktopApiChannel = (typeof DESKTOP_API_KEYS)[number];

export interface DesktopIpcBasicError {
  readonly code: "canceled" | "invalid-input" | "not-implemented" | "unknown";
  readonly message: string;
}

export interface DesktopIpcProviderError {
  readonly code: "provider-error";
  readonly message: "Online analysis could not be completed.";
  readonly providerErrorKind: ProviderErrorKind;
}

export type DesktopIpcError = DesktopIpcBasicError | DesktopIpcProviderError;

export type DesktopIpcResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: DesktopIpcError };

export interface DecomposeItem {
  readonly id: string;
  readonly text: string;
}

export interface DecomposeRequest {
  readonly requestId: string;
  readonly workspaceDir: string;
  readonly requirement: string;
  readonly claim?: string;
  readonly options?: { readonly ignore?: readonly string[] };
  readonly workflowToken?: string;
}

export interface DecomposeResponse {
  readonly assumptions: readonly string[];
  readonly claims: readonly DecomposeItem[];
  readonly clarifyingQuestions: readonly string[];
  readonly requirements: readonly DecomposeItem[];
  readonly warnings: readonly string[];
  readonly confidence?: number | undefined;
}

export interface AnalyzeRequest {
  readonly requestId: string;
  readonly workspaceDir: string;
  readonly requirement: string;
  readonly claim?: string;
  readonly workflowToken?: string;
  readonly requirements?: readonly DecomposeItem[];
  readonly claims?: readonly DecomposeItem[];
  readonly options?: {
    readonly generatedAt?: string;
    readonly topK?: number;
    readonly ignore?: readonly string[];
  };
}

export interface RenderHtmlRequest {
  readonly locale?: Locale;
  readonly report: JudgementReport;
  readonly templateId?: ReportTemplateId;
}

export interface RenderHtmlResponse {
  readonly html: string;
}

export interface SelectWorkspaceResponse {
  readonly workspaceDir?: string;
}

export interface ExportHtmlRequest {
  readonly defaultFileName?: string;
  readonly locale?: Locale;
  readonly report: JudgementReport;
  readonly templateId?: ReportTemplateId;
}

export interface ExportHtmlResponse {
  readonly filePath?: string;
}

export interface CopyRepairPromptRequest {
  readonly text: string;
}

export interface HistorySummary {
  readonly id: string;
  readonly createdAt: string;
  readonly workspaceDir: string;
  readonly requirementSummary: string;
}

export interface HistoryEntry extends HistorySummary {
  readonly report: JudgementReport;
}

export interface HistoryGetRequest {
  readonly id: string;
}

export interface HistorySaveRequest {
  readonly workspaceDir: string;
  readonly requirement: string;
  readonly report: JudgementReport;
}

export interface HistoryDeleteRequest {
  readonly id: string;
}

export interface HistoryRestoreRequest {
  readonly id: string;
}

export interface DesktopHistoryApi {
  list(): Promise<DesktopIpcResult<readonly HistorySummary[]>>;
  get(request: HistoryGetRequest): Promise<DesktopIpcResult<HistoryEntry | undefined>>;
  save(request: HistorySaveRequest): Promise<DesktopIpcResult<HistoryEntry>>;
  delete(request: HistoryDeleteRequest): Promise<DesktopIpcResult<{ readonly deleted: boolean }>>;
  restore(
    request: HistoryRestoreRequest,
  ): Promise<DesktopIpcResult<{ readonly restored: boolean }>>;
  clear(): Promise<DesktopIpcResult<{ readonly cleared: number }>>;
}

export interface SettingsSetRequest {
  readonly patch: DesktopSettingsPatch;
}

export interface SettingsSetWithSessionApiKeyRequest extends SettingsSetRequest {
  readonly apiKey?: string;
}

export interface SettingsSetWithSessionApiKeyResponse {
  readonly credentialStatus: CredentialStatus;
  readonly settings: DesktopSettings;
}

export interface CredentialSetSessionApiKeyRequest {
  readonly apiKey: string;
}

export interface CredentialStatusResponse {
  readonly credentialStatus: CredentialStatus;
}

export interface BundledFreeStatus {
  readonly limit: number;
  readonly localDate: string;
  readonly remaining: number;
  readonly resetsAt: string;
  readonly used: number;
}

export interface BundledFreePreflightRequest {
  readonly ignore?: readonly string[];
  readonly workspaceDir: string;
}

export interface BundledFreePreflightResponse {
  readonly eligible: boolean;
  readonly exceeded: readonly ("file-count" | "largest-file-bytes" | "total-bytes")[];
  readonly limits: {
    readonly analyzableFileCount: number;
    readonly largestAnalyzableFileBytes: number;
    readonly totalAnalyzableBytes: number;
  };
  readonly volume: {
    readonly analyzableFileCount: number;
    readonly largestAnalyzableFileBytes: number;
    readonly totalAnalyzableBytes: number;
  };
}

export interface BundledFreeStartWorkflowRequest extends BundledFreePreflightRequest {
  readonly claim?: string;
  readonly requestId: string;
  readonly requirement: string;
}

export interface BundledFreeStartWorkflowResponse {
  readonly status: BundledFreeStatus;
  readonly workflowToken: string;
}

export interface DesktopBundledFreeApi {
  status(): Promise<DesktopIpcResult<BundledFreeStatus>>;
  preflight(
    request: BundledFreePreflightRequest,
  ): Promise<DesktopIpcResult<BundledFreePreflightResponse>>;
  startWorkflow(
    request: BundledFreeStartWorkflowRequest,
  ): Promise<DesktopIpcResult<BundledFreeStartWorkflowResponse>>;
}

export interface DesktopSettingsApi {
  get(): Promise<DesktopIpcResult<DesktopSettings>>;
  set(request: SettingsSetRequest): Promise<DesktopIpcResult<DesktopSettings>>;
  setWithSessionApiKey(
    request: SettingsSetWithSessionApiKeyRequest,
  ): Promise<DesktopIpcResult<SettingsSetWithSessionApiKeyResponse>>;
  reset(): Promise<DesktopIpcResult<DesktopSettings>>;
}

export interface DesktopCredentialsApi {
  setSessionApiKey(
    request: CredentialSetSessionApiKeyRequest,
  ): Promise<DesktopIpcResult<CredentialStatusResponse>>;
  clearSessionApiKey(): Promise<DesktopIpcResult<CredentialStatusResponse>>;
  status(): Promise<DesktopIpcResult<CredentialStatusResponse>>;
}

export interface DesktopApi {
  decompose(request: DecomposeRequest): Promise<DesktopIpcResult<DecomposeResponse>>;
  analyze(request: AnalyzeRequest): Promise<DesktopIpcResult<JudgementReport>>;
  cancelAnalysis(request: { readonly requestId: string }): Promise<DesktopIpcResult<void>>;
  renderHtml(request: RenderHtmlRequest): Promise<DesktopIpcResult<RenderHtmlResponse>>;
  selectWorkspace(): Promise<DesktopIpcResult<SelectWorkspaceResponse>>;
  exportHtml(request: ExportHtmlRequest): Promise<DesktopIpcResult<ExportHtmlResponse>>;
  copyRepairPrompt(request: CopyRepairPromptRequest): Promise<DesktopIpcResult<void>>;
  readonly bundledFree: DesktopBundledFreeApi;
  readonly history: DesktopHistoryApi;
  readonly settings: DesktopSettingsApi;
  readonly credentials: DesktopCredentialsApi;
}
