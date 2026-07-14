import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  WorkspaceValidationError,
  inspectWorkspaceVolume,
  runDoneCheckPipelineNode,
  validateWorkspace,
} from "@donecheck/core";
import type { LLMProvider } from "@donecheck/core";
import { decomposeRequirements } from "@donecheck/core/semantic";
import { createHtmlReportDocument } from "@donecheck/report-ui";
import { defaultTemplate, getTemplateById } from "@donecheck/templates";
import { evaluateBundledFreeEligibility } from "./bundled-free-limits.js";
import { BundledFreeQuotaExhaustedError, BundledFreeWorkflowError } from "./bundled-free-quota.js";
import type {
  BundledFreeQuotaStore,
  BundledFreeWorkflowBinding,
  BundledFreeWorkflowManager,
} from "./bundled-free-quota.js";
import type { DesktopProviderFactory, SessionCredentialStore } from "./desktop-provider.js";
import type { HistoryStore } from "./history-store.js";
import type {
  AnalyzeRequest,
  BundledFreePreflightRequest,
  BundledFreePreflightResponse,
  BundledFreeStartWorkflowRequest,
  BundledFreeStartWorkflowResponse,
  BundledFreeStatus,
  CopyRepairPromptRequest,
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
  HistoryRestoreRequest,
  HistorySaveRequest,
  HistorySummary,
  RenderHtmlRequest,
  RenderHtmlResponse,
  SelectWorkspaceResponse,
  SettingsSetRequest,
} from "./ipc-contract.js";
import { classifyProviderErrorKind } from "./provider-error-kind.js";
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
  readonly writeClipboardText?: (text: string) => void;
  readonly bundledFreeQuotaStore?: BundledFreeQuotaStore;
  readonly bundledFreeWorkflowManager?: BundledFreeWorkflowManager;
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
  const activeRequests = new Map<string, AbortController>();
  return {
    decompose: (request) =>
      withStructuredErrors(
        () =>
          withAnalysisRequest(request.requestId, activeRequests, (signal) =>
            decompose(request, dependencies, signal),
          ),
        "analysis",
      ),
    analyze: (request) =>
      withStructuredErrors(
        () =>
          withAnalysisRequest(request.requestId, activeRequests, (signal) =>
            analyze(request, dependencies, signal),
          ),
        "analysis",
      ),
    cancelAnalysis: (request) =>
      withStructuredErrors(async () => {
        validateRequestId(request.requestId);
        dependencies.bundledFreeWorkflowManager?.cancelByRequestId(request.requestId);
        activeRequests.get(request.requestId)?.abort(canceledError());
      }),
    bundledFree: {
      status: () => withStructuredErrors(async () => bundledFreeStatus(dependencies)),
      preflight: (request) =>
        withStructuredErrors(() => bundledFreePreflight(request, dependencies)),
      startWorkflow: (request) =>
        withStructuredErrors(() => bundledFreeStartWorkflow(request, dependencies)),
    },
    renderHtml: (request) => withStructuredErrors(() => renderHtml(request)),
    selectWorkspace: () => withStructuredErrors(() => selectWorkspace(dependencies)),
    exportHtml: (request) => withStructuredErrors(() => exportHtml(request, dependencies)),
    copyRepairPrompt: (request) =>
      withStructuredErrors(() => copyRepairPrompt(request, dependencies)),
    history: {
      list: () => withStructuredErrors(() => historyList(dependencies)),
      get: (request) => withStructuredErrors(() => historyGet(request, dependencies)),
      save: (request) => withStructuredErrors(() => historySave(request, dependencies)),
      delete: (request) => withStructuredErrors(() => historyDelete(request, dependencies)),
      restore: (request) => withStructuredErrors(() => historyRestore(request, dependencies)),
      clear: () => withStructuredErrors(() => historyClear(dependencies)),
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

async function bundledFreePreflight(
  request: BundledFreePreflightRequest,
  _dependencies: DesktopIpcHandlerDependencies,
): Promise<BundledFreePreflightResponse> {
  const volume = await inspectWorkspaceVolume({
    workspacePath: request.workspaceDir,
    ...(request.ignore === undefined ? {} : { ignore: request.ignore }),
  });
  return evaluateBundledFreeEligibility(volume);
}

async function bundledFreeStartWorkflow(
  request: BundledFreeStartWorkflowRequest,
  dependencies: DesktopIpcHandlerDependencies,
): Promise<BundledFreeStartWorkflowResponse> {
  validateRequestId(request.requestId);
  if (request.requirement.trim().length === 0) throw invalidInput("requirement is required");
  const settings = requireSettingsStore(dependencies).get();
  if (settings.providerMode !== "bundled-free") {
    throw invalidInput("Free analysis is not the selected provider mode.");
  }
  const eligibility = await bundledFreePreflight(request, dependencies);
  if (!eligibility.eligible) throw invalidInput("The project is too large for free analysis.");
  const result = requireBundledFreeWorkflowManager(dependencies).reserve({
    ignore: request.ignore ?? [],
    providerMode: settings.providerMode,
    requestId: request.requestId,
    workspaceDir: resolve(request.workspaceDir),
  });
  return { status: result.status, workflowToken: result.token };
}

function bundledFreeStatus(dependencies: DesktopIpcHandlerDependencies): BundledFreeStatus {
  const store = dependencies.bundledFreeQuotaStore;
  if (store === undefined) throw notImplemented("free analysis quota dependency was not provided");
  return store.status();
}

function requireBundledFreeWorkflowManager(
  dependencies: DesktopIpcHandlerDependencies,
): BundledFreeWorkflowManager {
  if (dependencies.bundledFreeWorkflowManager === undefined) {
    throw notImplemented("free analysis workflow dependency was not provided");
  }
  return dependencies.bundledFreeWorkflowManager;
}

function requireWorkflowToken(token: string | undefined): string {
  if (token === undefined || token.trim().length === 0) {
    throw invalidInput("A free analysis workflow token is required.");
  }
  return token;
}

function workflowBinding(
  request: DecomposeRequest | AnalyzeRequest,
  providerMode: "bundled-free",
): BundledFreeWorkflowBinding {
  return {
    ignore: request.options?.ignore ?? [],
    providerMode,
    requestId: request.requestId,
    workspaceDir: resolve(request.workspaceDir),
  };
}

async function copyRepairPrompt(
  request: CopyRepairPromptRequest,
  dependencies: DesktopIpcHandlerDependencies,
): Promise<void> {
  if (typeof request.text !== "string" || request.text.trim().length === 0) {
    throw invalidInput("repair prompt text is required");
  }
  if (dependencies.writeClipboardText === undefined) {
    throw notImplemented("clipboard dependency was not provided");
  }
  dependencies.writeClipboardText(request.text);
}

async function analyze(
  request: AnalyzeRequest,
  dependencies: DesktopIpcHandlerDependencies,
  signal: AbortSignal,
) {
  validateAnalyzeRequest(request);
  const settings = dependencies.settingsStore?.get();
  if (settings?.providerMode === "bundled-free") {
    const binding = workflowBinding(request, settings.providerMode);
    requireBundledFreeWorkflowManager(dependencies).consumeAnalyze(
      requireWorkflowToken(request.workflowToken),
      binding,
    );
    const eligibility = evaluateBundledFreeEligibility(
      await inspectWorkspaceVolume({
        workspacePath: request.workspaceDir,
        ignore: binding.ignore,
        signal,
      }),
    );
    if (!eligibility.eligible) throw invalidInput("The project is too large for free analysis.");
  } else {
    await validateWorkspace(request.workspaceDir, request.options?.ignore, signal);
  }
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
    signal,
  });
  return result.report;
}

async function decompose(
  request: DecomposeRequest,
  dependencies: DesktopIpcHandlerDependencies,
  signal: AbortSignal,
): Promise<DecomposeResponse> {
  validateDecomposeRequest(request);
  const settings = dependencies.settingsStore?.get();
  const ignore = request.options?.ignore ?? [];
  if (settings?.providerMode === "bundled-free") {
    requireBundledFreeWorkflowManager(dependencies).consumeDecompose(
      requireWorkflowToken(request.workflowToken),
      workflowBinding(request, settings.providerMode),
    );
  }
  await validateWorkspace(request.workspaceDir, ignore, signal);
  const provider =
    dependencies.providerFactory?.() ?? dependencies.desktopProviderFactory?.createProvider();
  if (provider === undefined) throw invalidInput("provider dependency was not provided");
  const decomposition = await decomposeRequirements({
    requirement: request.requirement,
    provider,
    ...(request.claim === undefined ? {} : { claim: request.claim }),
    signal,
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

async function historyRestore(
  request: HistoryRestoreRequest,
  dependencies: DesktopIpcHandlerDependencies,
): Promise<{ readonly restored: boolean }> {
  return requireHistoryStore(dependencies).restore(request);
}

async function historyClear(
  dependencies: DesktopIpcHandlerDependencies,
): Promise<{ readonly cleared: number }> {
  return requireHistoryStore(dependencies).clear();
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
    throw notImplemented(historyNotImplemented.message);
  }
  return dependencies.historyStore;
}

function requireSettingsStore(dependencies: DesktopIpcHandlerDependencies): SettingsStore {
  if (dependencies.settingsStore === undefined) {
    throw notImplemented(settingsNotImplemented.message);
  }
  return dependencies.settingsStore;
}

function requireCredentials(dependencies: DesktopIpcHandlerDependencies): SessionCredentialStore {
  if (dependencies.credentials === undefined) {
    throw notImplemented(credentialsNotImplemented.message);
  }
  return dependencies.credentials;
}

function validateAnalyzeRequest(request: AnalyzeRequest): void {
  validateRequestId(request.requestId);
  if (typeof request.workspaceDir !== "string" || request.workspaceDir.trim().length === 0) {
    throw invalidInput("workspaceDir is required");
  }
  if (typeof request.requirement !== "string" || request.requirement.trim().length === 0) {
    throw invalidInput("requirement is required");
  }
}

function validateDecomposeRequest(request: DecomposeRequest): void {
  validateRequestId(request.requestId);
  if (typeof request.workspaceDir !== "string" || request.workspaceDir.trim().length === 0) {
    throw invalidInput("workspaceDir is required");
  }
  if (typeof request.requirement !== "string" || request.requirement.trim().length === 0) {
    throw invalidInput("requirement is required");
  }
}

function validateRequestId(requestId: string): void {
  if (typeof requestId !== "string" || requestId.trim().length === 0) {
    throw invalidInput("requestId is required");
  }
}

async function withAnalysisRequest<T>(
  requestId: string,
  activeRequests: Map<string, AbortController>,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  validateRequestId(requestId);
  activeRequests.get(requestId)?.abort(canceledError());
  const controller = new AbortController();
  activeRequests.set(requestId, controller);
  try {
    return await operation(controller.signal);
  } finally {
    if (activeRequests.get(requestId) === controller) activeRequests.delete(requestId);
  }
}

async function withStructuredErrors<T>(
  fn: () => Promise<T>,
  operation: "analysis" | "desktop" = "desktop",
): HandlerResult<T> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: toDesktopIpcError(error, operation) };
  }
}

class InvalidDesktopInputError extends Error {
  readonly code = "invalid-input" as const;
  override readonly name = "InvalidDesktopInputError";
}

class AnalysisCanceledError extends Error {
  readonly code = "canceled" as const;
  override readonly name = "AnalysisCanceledError";
}

class DesktopFeatureNotImplementedError extends Error {
  readonly code = "not-implemented" as const;
  override readonly name = "DesktopFeatureNotImplementedError";
}

function invalidInput(message: string): InvalidDesktopInputError {
  return new InvalidDesktopInputError(message);
}

function canceledError(): AnalysisCanceledError {
  return new AnalysisCanceledError("Analysis canceled");
}

function notImplemented(message: string): DesktopFeatureNotImplementedError {
  return new DesktopFeatureNotImplementedError(message);
}

function toDesktopIpcError(error: unknown, operation: "analysis" | "desktop"): DesktopIpcError {
  if (error instanceof WorkspaceValidationError) {
    return { code: "invalid-input", message: "The selected project folder is invalid." };
  }
  if (error instanceof AnalysisCanceledError) {
    return { code: "canceled", message: error.message };
  }
  if (error instanceof InvalidDesktopInputError) {
    return { code: "invalid-input", message: error.message };
  }
  if (error instanceof BundledFreeQuotaExhaustedError) {
    return { code: "invalid-input", message: "Today's free analysis limit has been reached." };
  }
  if (error instanceof BundledFreeWorkflowError) {
    return { code: "invalid-input", message: error.message };
  }
  if (error instanceof DesktopFeatureNotImplementedError) {
    return { code: "not-implemented", message: error.message };
  }
  if (operation === "analysis") {
    return {
      code: "provider-error",
      message: "Online analysis could not be completed.",
      providerErrorKind: classifyProviderErrorKind(error),
    };
  }
  return { code: "unknown", message: "The requested operation could not be completed." };
}
