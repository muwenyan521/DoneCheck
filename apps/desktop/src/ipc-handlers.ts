import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runDoneCheckPipelineNode } from "@donecheck/core";
import type { LLMProvider } from "@donecheck/core";
import { decomposeRequirements } from "@donecheck/core/semantic";
import { createHtmlReportDocument } from "@donecheck/report-ui";
import { defaultTemplate, getTemplateById } from "@donecheck/templates";
import type { DesktopProviderFactory, SessionCredentialStore } from "./desktop-provider.js";
import type { HistoryStore } from "./history-store.js";
import type {
  AnalyzeRequest,
  CredentialSetSessionApiKeyRequest,
  CredentialStatusResponse,
  DecomposeRequest,
  DecomposeResponse,
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
  SettingsSetRequest,
} from "./ipc-contract.js";
import type { DesktopSettings, SettingsStore } from "./settings-store.js";

type HandlerResult<T> = Promise<DesktopIpcResult<T>>;

export interface DesktopIpcHandlerDependencies {
  readonly historyStore?: HistoryStore;
  readonly saveDialog?: (defaultFileName: string) => Promise<string | undefined>;
  readonly selectDirectory?: () => Promise<string | undefined>;
  readonly providerFactory?: () => LLMProvider;
  readonly desktopProviderFactory?: DesktopProviderFactory;
  readonly settingsStore?: SettingsStore;
  readonly credentials?: SessionCredentialStore;
}

const historyNotImplemented = {
  code: "not-implemented",
  message: "history store dependency was not provided",
} as const;

const settingsNotImplemented = {
  code: "not-implemented",
  message: "settings store dependency was not provided",
} as const;

const credentialsNotImplemented = {
  code: "not-implemented",
  message: "credentials dependency was not provided",
} as const;

export function createDesktopIpcHandlers(
  dependencies: DesktopIpcHandlerDependencies = {},
): DesktopApi {
  return {
    decompose: (request) => withStructuredErrors(() => decompose(request, dependencies)),
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
    settings: {
      get: () => withStructuredErrors(() => settingsGet(dependencies)),
      set: (request) => withStructuredErrors(() => settingsSet(request, dependencies)),
      reset: () => withStructuredErrors(() => settingsReset(dependencies)),
    },
    credentials: {
      setSessionApiKey: (request) =>
        withStructuredErrors(() => credentialSetSessionApiKey(request, dependencies)),
      clearSessionApiKey: () =>
        withStructuredErrors(() => credentialClearSessionApiKey(dependencies)),
      status: () => withStructuredErrors(() => credentialStatus(dependencies)),
    },
  };
}

async function analyze(request: AnalyzeRequest, dependencies: DesktopIpcHandlerDependencies) {
  validateAnalyzeRequest(request);
  const provider =
    dependencies.providerFactory?.() ?? dependencies.desktopProviderFactory?.createProvider();
  if (provider === undefined) throw invalidInput("provider dependency was not provided");
  const result = await runDoneCheckPipelineNode({
    workspacePath: request.workspaceDir,
    requirement: request.requirement,
    ...(request.claim === undefined ? {} : { claim: request.claim }),
    ...(request.requirements === undefined ? {} : { requirements: request.requirements }),
    ...(request.claims === undefined ? {} : { claims: request.claims }),
    provider,
    ...(request.options?.generatedAt === undefined
      ? {}
      : { generatedAt: request.options.generatedAt }),
    ...(request.options?.topK === undefined ? {} : { topK: request.options.topK }),
    ...(request.options?.ignore === undefined ? {} : { ignore: request.options.ignore }),
  });
  return result.report;
}

async function decompose(
  request: DecomposeRequest,
  dependencies: DesktopIpcHandlerDependencies,
): Promise<DecomposeResponse> {
  validateDecomposeRequest(request);
  const provider =
    dependencies.providerFactory?.() ?? dependencies.desktopProviderFactory?.createProvider();
  if (provider === undefined) throw invalidInput("provider dependency was not provided");
  const decomposition = await decomposeRequirements({
    requirement: request.requirement,
    provider,
    ...(request.claim === undefined ? {} : { claim: request.claim }),
  });
  return decomposition;
}

async function renderHtml(request: RenderHtmlRequest): Promise<RenderHtmlResponse> {
  const template =
    request.templateId === undefined ? defaultTemplate : getTemplateById(request.templateId);
  const html = createHtmlReportDocument({
    includeStyles: true,
    locale: request.locale ?? "zh-CN",
    report: request.report,
    template: template ?? defaultTemplate,
  });
  return { html };
}

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
  if (request.report === undefined || request.report === null) {
    throw invalidInput("report is required");
  }
  const template =
    request.templateId === undefined ? defaultTemplate : getTemplateById(request.templateId);
  const html = createHtmlReportDocument({
    includeStyles: true,
    locale: request.locale ?? "zh-CN",
    report: request.report,
    template: template ?? defaultTemplate,
  });
  const defaultFileName = request.defaultFileName ?? "donecheck-report.html";
  const filePath = await dependencies.saveDialog?.(defaultFileName);
  if (filePath === undefined) return {};
  await writeFile(filePath, html, "utf8");
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

async function settingsGet(dependencies: DesktopIpcHandlerDependencies): Promise<DesktopSettings> {
  return requireSettingsStore(dependencies).get();
}

async function settingsSet(
  request: SettingsSetRequest,
  dependencies: DesktopIpcHandlerDependencies,
): Promise<DesktopSettings> {
  return requireSettingsStore(dependencies).set(request.patch);
}

async function settingsReset(
  dependencies: DesktopIpcHandlerDependencies,
): Promise<DesktopSettings> {
  return requireSettingsStore(dependencies).reset();
}

async function credentialSetSessionApiKey(
  request: CredentialSetSessionApiKeyRequest,
  dependencies: DesktopIpcHandlerDependencies,
): Promise<CredentialStatusResponse> {
  return { credentialStatus: requireCredentials(dependencies).setSessionApiKey(request.apiKey) };
}

async function credentialClearSessionApiKey(
  dependencies: DesktopIpcHandlerDependencies,
): Promise<CredentialStatusResponse> {
  return { credentialStatus: requireCredentials(dependencies).clearSessionApiKey() };
}

async function credentialStatus(
  dependencies: DesktopIpcHandlerDependencies,
): Promise<CredentialStatusResponse> {
  return { credentialStatus: requireCredentials(dependencies).getStatus() };
}

function requireHistoryStore(dependencies: DesktopIpcHandlerDependencies): HistoryStore {
  if (dependencies.historyStore === undefined) {
    throw Object.assign(new Error(historyNotImplemented.message), {
      code: historyNotImplemented.code,
    });
  }
  return dependencies.historyStore;
}

function requireSettingsStore(dependencies: DesktopIpcHandlerDependencies): SettingsStore {
  if (dependencies.settingsStore === undefined) {
    throw Object.assign(new Error(settingsNotImplemented.message), {
      code: settingsNotImplemented.code,
    });
  }
  return dependencies.settingsStore;
}

function requireCredentials(dependencies: DesktopIpcHandlerDependencies): SessionCredentialStore {
  if (dependencies.credentials === undefined) {
    throw Object.assign(new Error(credentialsNotImplemented.message), {
      code: credentialsNotImplemented.code,
    });
  }
  return dependencies.credentials;
}

function validateAnalyzeRequest(request: AnalyzeRequest): void {
  if (typeof request.workspaceDir !== "string" || request.workspaceDir.trim().length === 0) {
    throw invalidInput("workspaceDir is required");
  }
  if (typeof request.requirement !== "string" || request.requirement.trim().length === 0) {
    throw invalidInput("requirement is required");
  }
}

function validateDecomposeRequest(request: DecomposeRequest): void {
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
