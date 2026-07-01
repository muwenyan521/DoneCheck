import type { JudgementReport } from "@donecheck/core";
import type { ReportTemplateId } from "@donecheck/shared";

export type { JudgementReport } from "@donecheck/core";
export type { ReportTemplateId } from "@donecheck/shared";

export type Locale = "en" | "zh-CN";

export const DESKTOP_API_KEYS = [
  "donecheck:analyze",
  "donecheck:render-html",
  "donecheck:select-workspace",
  "donecheck:export-html",
  "donecheck:history:list",
  "donecheck:history:get",
  "donecheck:history:save",
  "donecheck:history:delete",
] as const;

export type DesktopApiChannel = (typeof DESKTOP_API_KEYS)[number];

export interface DesktopIpcError {
  readonly code: "invalid-input" | "not-implemented" | "unknown";
  readonly message: string;
}

export type DesktopIpcResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: DesktopIpcError };

export interface AnalyzeRequest {
  readonly workspaceDir: string;
  readonly requirement: string;
  readonly claim?: string;
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
  readonly html: string;
}

export interface ExportHtmlResponse {
  readonly filePath?: string;
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

export interface DesktopHistoryApi {
  list(): Promise<DesktopIpcResult<readonly HistorySummary[]>>;
  get(request: HistoryGetRequest): Promise<DesktopIpcResult<HistoryEntry | undefined>>;
  save(request: HistorySaveRequest): Promise<DesktopIpcResult<HistoryEntry>>;
  delete(request: HistoryDeleteRequest): Promise<DesktopIpcResult<{ readonly deleted: boolean }>>;
}

export interface DesktopApi {
  analyze(request: AnalyzeRequest): Promise<DesktopIpcResult<JudgementReport>>;
  renderHtml(request: RenderHtmlRequest): Promise<DesktopIpcResult<RenderHtmlResponse>>;
  selectWorkspace(): Promise<DesktopIpcResult<SelectWorkspaceResponse>>;
  exportHtml(request: ExportHtmlRequest): Promise<DesktopIpcResult<ExportHtmlResponse>>;
  readonly history: DesktopHistoryApi;
}
