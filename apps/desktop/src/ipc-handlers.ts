import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runDoneCheckPipelineNode } from "@donecheck/core";
import type { LLMProvider } from "@donecheck/core";
import { createProvider } from "@donecheck/provider-openai";
import { createHtmlReportDocument } from "@donecheck/report-ui";
import { defaultTemplate, getTemplateById } from "@donecheck/templates";
import type { HistoryStore } from "./history-store.js";
import type {
  AnalyzeRequest,
  DesktopApi,
  DesktopIpcError,
  DesktopIpcResult,
  ExportHtmlRequest,
  ExportHtmlResponse,
  HistoryDeleteRequest,
  HistoryEntry,
  HistoryGetRequest,
  HistorySaveRequest,
  HistorySummary,
  RenderHtmlRequest,
  RenderHtmlResponse,
  SelectWorkspaceResponse,
} from "./ipc-contract.js";

type HandlerResult<T> = Promise<DesktopIpcResult<T>>;

export interface DesktopIpcHandlerDependencies {
  readonly historyStore?: HistoryStore;
  readonly saveDialog?: (defaultFileName: string) => Promise<string | undefined>;
  readonly selectDirectory?: () => Promise<string | undefined>;
  readonly providerFactory?: () => LLMProvider;
}

const historyNotImplemented = {
  code: "not-implemented",
  message: "history storage is implemented in milestone 6.3",
} as const;

export function createDesktopIpcHandlers(
  dependencies: DesktopIpcHandlerDependencies = {},
): DesktopApi {
  return {
    analyze: (request) => withStructuredErrors(() => analyze(request, dependencies)),
    renderHtml: (request) => withStructuredErrors(() => renderHtml(request)),
    selectWorkspace: () => withStructuredErrors(() => selectWorkspace(dependencies)),
    exportHtml: (request) => withStructuredErrors(() => exportHtml(request, dependencies)),
    history: {
      list: () => withStructuredErrors(() => historyList(dependencies)),
      get: (request) => withStructuredErrors(() => historyGet(request, dependencies)),
      save: (request) => withStructuredErrors(() => historySave(request, dependencies)),
      delete: (request) => withStructuredErrors(() => historyDelete(request, dependencies)),
    },
  };
}

async function analyze(request: AnalyzeRequest, dependencies: DesktopIpcHandlerDependencies) {
  validateAnalyzeRequest(request);
  const provider = dependencies.providerFactory?.() ?? createProvider({ stderr: () => {} });
  const result = await runDoneCheckPipelineNode({
    workspacePath: request.workspaceDir,
    requirement: request.requirement,
    ...(request.claim === undefined ? {} : { claim: request.claim }),
    provider,
    ...(request.options?.generatedAt === undefined
      ? {}
      : { generatedAt: request.options.generatedAt }),
    ...(request.options?.topK === undefined ? {} : { topK: request.options.topK }),
    ...(request.options?.ignore === undefined ? {} : { ignore: request.options.ignore }),
  });
  return result.report;
}

async function renderHtml(request: RenderHtmlRequest): Promise<RenderHtmlResponse> {
  const template =
    request.templateId === undefined ? defaultTemplate : getTemplateById(request.templateId);
  const html = createHtmlReportDocument({
    locale: request.locale ?? "zh-CN",
    report: request.report,
    template: template ?? defaultTemplate,
    title: "DoneCheck Report",
  });
  return {
    html: injectDesktopExportStyles(html),
  };
}

export function injectDesktopExportStyles(html: string): string {
  if (html.includes('data-donecheck-desktop-export="true"')) return html;
  const headCloseMatch = /<\/head\s*>/iu.exec(html);
  if (headCloseMatch === null || headCloseMatch.index === undefined) return html;
  const insertAt = headCloseMatch.index;
  return `${html.slice(0, insertAt)}${desktopExportStyleTag}${html.slice(insertAt)}`;
}

const desktopExportStyleTag = `<style data-donecheck-desktop-export="true">
:root{color:#172033;background:#eef3f8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;padding:32px;background:linear-gradient(135deg,#eef3f8 0%,#f8fafc 48%,#e8f0ff 100%)}article[data-locale]{max-width:1120px;margin:0 auto;border:1px solid #d8e2ed;border-radius:28px;background:rgba(255,255,255,.96);box-shadow:0 24px 80px rgba(23,32,51,.12);padding:32px}header{border-bottom:1px solid #d8e2ed;margin-bottom:24px;padding-bottom:20px}h1{font-size:32px;letter-spacing:-.03em;margin:0 0 8px}h2{font-size:20px;margin:24px 0 12px}h3{font-size:16px;margin:0 0 8px}p,dd,li{line-height:1.6}section{margin:24px 0}dl{display:grid;grid-template-columns:minmax(160px,max-content) 1fr;gap:10px 18px;margin:0}dt{color:#526171;font-weight:800}dd{margin:0}ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;list-style:none;padding:0}li{border:1px solid #d8e2ed;border-radius:14px;background:#f8fafc;padding:10px 12px}article article{border:1px solid #d8e2ed;border-left:6px solid #1f6feb;border-radius:18px;background:#fff;margin:14px 0;padding:16px}article article[data-highlighted="true"]{border-left-color:#d97706;background:#fffbeb}article article[data-kind="extra-scope"]{border-left-color:#7c3aed}pre{white-space:pre-wrap;overflow:auto;border-radius:14px;background:#0f172a;color:#dbeafe;padding:14px}details{border:1px solid #d8e2ed;border-radius:16px;background:#f8fafc;margin:12px 0;padding:12px}summary{cursor:pointer;font-weight:800}@media (max-width:720px){body{padding:16px}article[data-locale]{padding:20px;border-radius:20px}dl{grid-template-columns:1fr}ul{grid-template-columns:1fr}}
</style>`;

async function selectWorkspace(
  dependencies: DesktopIpcHandlerDependencies,
): Promise<SelectWorkspaceResponse> {
  const workspaceDir = await dependencies.selectDirectory?.();
  return workspaceDir === undefined ? {} : { workspaceDir };
}

async function exportHtml(
  request: ExportHtmlRequest,
  dependencies: DesktopIpcHandlerDependencies,
): Promise<ExportHtmlResponse> {
  if (typeof request.html !== "string" || request.html.trim().length === 0) {
    throw invalidInput("html is required");
  }
  const defaultFileName = request.defaultFileName ?? "donecheck-report.html";
  const filePath = await dependencies.saveDialog?.(defaultFileName);
  if (filePath === undefined) return {};
  await writeFile(filePath, request.html, "utf8");
  return { filePath };
}

export function defaultExportPath(downloadsDir: string, defaultFileName: string): string {
  return join(downloadsDir, defaultFileName);
}

async function historyList(
  dependencies: DesktopIpcHandlerDependencies,
): Promise<readonly HistorySummary[]> {
  return requireHistoryStore(dependencies).list();
}

async function historyGet(
  request: HistoryGetRequest,
  dependencies: DesktopIpcHandlerDependencies,
): Promise<HistoryEntry | undefined> {
  return requireHistoryStore(dependencies).get(request);
}

async function historySave(
  request: HistorySaveRequest,
  dependencies: DesktopIpcHandlerDependencies,
): Promise<HistoryEntry> {
  return requireHistoryStore(dependencies).save(request);
}

async function historyDelete(
  request: HistoryDeleteRequest,
  dependencies: DesktopIpcHandlerDependencies,
): Promise<{ readonly deleted: boolean }> {
  return requireHistoryStore(dependencies).delete(request);
}

function requireHistoryStore(dependencies: DesktopIpcHandlerDependencies): HistoryStore {
  if (dependencies.historyStore === undefined) {
    throw Object.assign(new Error(historyNotImplemented.message), {
      code: historyNotImplemented.code,
    });
  }
  return dependencies.historyStore;
}

function validateAnalyzeRequest(request: AnalyzeRequest): void {
  if (typeof request.workspaceDir !== "string" || request.workspaceDir.trim().length === 0) {
    throw invalidInput("workspaceDir is required");
  }
  if (typeof request.requirement !== "string" || request.requirement.trim().length === 0) {
    throw invalidInput("requirement is required");
  }
}

async function withStructuredErrors<T>(fn: () => Promise<T>): HandlerResult<T> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: toDesktopIpcError(error) };
  }
}

function invalidInput(message: string): Error & { readonly code: "invalid-input" } {
  return Object.assign(new Error(message), { code: "invalid-input" as const });
}

function toDesktopIpcError(error: unknown): DesktopIpcError {
  if (isErrorWithCode(error) && error.code === "invalid-input") {
    return { code: "invalid-input", message: error.message };
  }
  if (isErrorWithCode(error) && error.code === "not-implemented") {
    return { code: "not-implemented", message: error.message };
  }
  return { code: "unknown", message: error instanceof Error ? error.message : "Unknown error" };
}

function isErrorWithCode(error: unknown): error is Error & { readonly code: string } {
  return error instanceof Error && "code" in error;
}
