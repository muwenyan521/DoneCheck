import type { DesktopApiChannel } from "./ipc-contract.js";
import { isAllowedRendererNavigation } from "./navigation-policy.js";

export interface IpcSenderEvent {
  readonly senderFrame?: { readonly url?: unknown } | null;
}

const noRequestChannels = new Set<DesktopApiChannel>([
  "donecheck:select-workspace",
  "donecheck:history:list",
  "donecheck:history:clear",
  "donecheck:settings:get",
  "donecheck:settings:reset",
  "donecheck:credentials:clear-session-api-key",
  "donecheck:credentials:status",
  "donecheck:bundled-free:status",
]);

const maxReportBytes = 10 * 1024 * 1024;
const maxAnalysisTextLength = 200_000;

export function assertAllowedIpcSender(event: unknown, rendererEntryUrl: string): void {
  if (!isRecord(event)) throw new Error("The request source is not allowed.");
  const senderFrame = event.senderFrame;
  if (!isRecord(senderFrame) || typeof senderFrame.url !== "string") {
    throw new Error("The request source is not allowed.");
  }
  if (!isAllowedRendererNavigation(senderFrame.url, rendererEntryUrl)) {
    throw new Error("The request source is not allowed.");
  }
}

export function assertValidIpcArguments(
  channel: DesktopApiChannel,
  args: readonly unknown[],
): void {
  if (noRequestChannels.has(channel)) {
    if (args.length !== 0) throw new Error("This action does not accept additional information.");
    return;
  }
  if (args.length !== 1) throw new Error("This action requires exactly one request.");
  const request = args[0];
  switch (channel) {
    case "donecheck:decompose":
      validateAnalysisBase(request, [
        "requestId",
        "workspaceDir",
        "requirement",
        "claim",
        "options",
        "workflowToken",
      ]);
      validateWorkflowFields(request);
      return;
    case "donecheck:analyze":
      validateAnalyze(request);
      return;
    case "donecheck:bundled-free:preflight":
      validateBundledFreePreflight(request);
      return;
    case "donecheck:bundled-free:start-workflow":
      validateAnalysisBase(request, [
        "requestId",
        "workspaceDir",
        "requirement",
        "claim",
        "ignore",
      ]);
      if (isRecord(request) && request.ignore !== undefined) {
        validateStringArray(request.ignore, "ignore", 500, 4_096);
      }
      return;
    case "donecheck:cancel-analysis":
    case "donecheck:history:get":
    case "donecheck:history:delete":
    case "donecheck:history:restore":
      validateIdRequest(request, channel === "donecheck:cancel-analysis" ? "requestId" : "id");
      return;
    case "donecheck:render-html":
      validateReportRequest(request, ["report", "locale", "templateId"]);
      return;
    case "donecheck:export-html":
      validateReportRequest(request, ["report", "locale", "templateId", "defaultFileName"]);
      if (isRecord(request) && request.defaultFileName !== undefined) {
        const defaultFileName = request.defaultFileName;
        validateString(defaultFileName, "defaultFileName", 1, 128);
        if (typeof defaultFileName !== "string" || !/^[^/\\]+\.html$/iu.test(defaultFileName)) {
          throw new Error("The report file name must be a simple HTML file name.");
        }
      }
      return;
    case "donecheck:history:save":
      validateHistorySave(request);
      return;
    case "donecheck:settings:set":
      validateSettingsSet(request);
      return;
    case "donecheck:settings:set-with-session-api-key":
      validateSettingsSetWithSessionApiKey(request);
      return;
    case "donecheck:credentials:set-session-api-key":
      validateSingleStringRequest(request, "apiKey", 1, 16_384);
      return;
    case "donecheck:clipboard:copy-repair-prompt":
      validateSingleStringRequest(request, "text", 1, 2 * 1024 * 1024);
      return;
    default:
      throw new Error("Unsupported app action.");
  }
}

function validateAnalyze(value: unknown): void {
  validateAnalysisBase(value, [
    "requestId",
    "workspaceDir",
    "requirement",
    "claim",
    "requirements",
    "claims",
    "options",
    "workflowToken",
  ]);
  if (!isRecord(value)) return;
  if (value.requirements !== undefined) validateItems(value.requirements, "requirements");
  if (value.claims !== undefined) validateItems(value.claims, "claims");
  if (value.options !== undefined) {
    assertRecordWithKeys(value.options, ["generatedAt", "topK", "ignore"]);
    if (value.options.generatedAt !== undefined)
      validateString(value.options.generatedAt, "generatedAt", 1, 128);
    if (
      value.options.topK !== undefined &&
      (!Number.isInteger(value.options.topK) ||
        Number(value.options.topK) < 1 ||
        Number(value.options.topK) > 10_000)
    )
      throw new Error("topK is outside the allowed range.");
    if (value.options.ignore !== undefined)
      validateStringArray(value.options.ignore, "ignore", 500, 4_096);
  }
  validateWorkflowFields(value);
}

function validateWorkflowFields(value: unknown): void {
  if (!isRecord(value)) return;
  if (value.workflowToken !== undefined) {
    validateString(value.workflowToken, "workflowToken", 1, 128);
  }
  if (
    value.options !== undefined &&
    isRecord(value.options) &&
    value.options.ignore !== undefined
  ) {
    validateStringArray(value.options.ignore, "ignore", 500, 4_096);
  }
}

function validateBundledFreePreflight(value: unknown): void {
  assertRecordWithKeys(value, ["workspaceDir", "ignore"]);
  validateString(value.workspaceDir, "workspaceDir", 1, 4_096);
  if (value.ignore !== undefined) validateStringArray(value.ignore, "ignore", 500, 4_096);
}

function validateAnalysisBase(value: unknown, keys: readonly string[]): void {
  assertRecordWithKeys(value, keys);
  validateString(value.requestId, "requestId", 1, 128);
  validateString(value.workspaceDir, "workspaceDir", 1, 4_096);
  validateString(value.requirement, "requirement", 1, maxAnalysisTextLength);
  if (value.claim !== undefined) validateString(value.claim, "claim", 0, maxAnalysisTextLength);
  validateSerializedSize(value, 2 * 1024 * 1024, "analysis request");
}

function validateItems(value: unknown, name: string): void {
  if (!Array.isArray(value) || value.length > 500) throw new Error(`${name} is too large.`);
  for (const item of value) {
    assertRecordWithKeys(item, ["id", "text"]);
    validateString(item.id, `${name} id`, 1, 128);
    validateString(item.text, `${name} text`, 1, maxAnalysisTextLength);
  }
}

function validateReportRequest(value: unknown, keys: readonly string[]): void {
  assertRecordWithKeys(value, keys);
  if (!isRecord(value.report)) throw new Error("A report is required.");
  validateOptionalPresentation(value);
  validateSerializedSize(value.report, maxReportBytes, "report");
}

function validateHistorySave(value: unknown): void {
  assertRecordWithKeys(value, ["workspaceDir", "requirement", "report"]);
  validateString(value.workspaceDir, "workspaceDir", 1, 4_096);
  validateString(value.requirement, "requirement", 1, maxAnalysisTextLength);
  if (!isRecord(value.report)) throw new Error("A report is required.");
  validateSerializedSize(value.report, maxReportBytes, "report");
}

function validateSettingsSet(value: unknown): void {
  assertRecordWithKeys(value, ["patch"]);
  assertRecordWithKeys(value.patch, [
    "providerMode",
    "providerBaseUrl",
    "providerModel",
    "topK",
    "ignore",
    "confirmRequirementDecomposition",
    "locale",
    "templateId",
    "defaultWorkspaceDir",
    "recentWorkspaces",
    "autoSaveHistory",
    "reopenLastWorkspace",
  ]);
  validateSerializedSize(value.patch, 256 * 1024, "settings");
  for (const key of ["providerBaseUrl", "providerModel", "defaultWorkspaceDir"] as const) {
    const field = value.patch[key];
    if (field !== undefined && field !== null) validateString(field, key, 0, 4_096);
  }
  for (const key of ["ignore", "recentWorkspaces"] as const) {
    const field = value.patch[key];
    if (field !== undefined) validateStringArray(field, key, 500, 4_096);
  }
}

function validateSettingsSetWithSessionApiKey(value: unknown): void {
  assertRecordWithKeys(value, ["patch", "apiKey"]);
  validateSettingsSet({ patch: value.patch });
  if (value.apiKey !== undefined) validateString(value.apiKey, "apiKey", 1, 16_384);
}

function validateOptionalPresentation(value: Record<string, unknown>): void {
  if (value.locale !== undefined && value.locale !== "en" && value.locale !== "zh-CN")
    throw new Error("The report language is not supported.");
  if (
    value.templateId !== undefined &&
    value.templateId !== "generic" &&
    value.templateId !== "todo" &&
    value.templateId !== "frontend"
  )
    throw new Error("The report type is not supported.");
}

function validateIdRequest(value: unknown, key: "id" | "requestId"): void {
  assertRecordWithKeys(value, [key]);
  validateString(value[key], key, 1, 128);
}

function validateSingleStringRequest(value: unknown, key: string, min: number, max: number): void {
  assertRecordWithKeys(value, [key]);
  validateString(value[key], key, min, max);
}

function validateStringArray(
  value: unknown,
  name: string,
  maxItems: number,
  maxLength: number,
): void {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${name} is too large.`);
  for (const item of value) validateString(item, name, 0, maxLength);
}

function validateString(value: unknown, name: string, min: number, max: number): void {
  if (typeof value !== "string" || value.length < min || value.length > max)
    throw new Error(`${name} is outside the allowed length.`);
}

function validateSerializedSize(value: unknown, maxBytes: number, name: string): void {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error(`The ${name} could not be read.`);
  }
  if (Buffer.byteLength(serialized, "utf8") > maxBytes)
    throw new Error(`The ${name} is too large.`);
}

function assertRecordWithKeys(
  value: unknown,
  keys: readonly string[],
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error("The request has an invalid format.");
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new Error("The request contains unsupported information.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
