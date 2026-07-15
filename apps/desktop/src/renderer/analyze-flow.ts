import type {
  AnalyzeRequest,
  BundledFreeStartWorkflowRequest,
  BundledFreeStartWorkflowResponse,
  DecomposeRequest,
  DecomposeResponse,
  DesktopIpcError,
  DesktopIpcResult,
  JudgementReport,
  Locale,
  ReportTemplateId,
} from "../ipc-contract.js";
import type { ProviderErrorKind } from "../provider-error-kind.js";
import type { ProviderMode } from "../settings-model.js";

export interface AnalyzeFlowApi {
  readonly decompose: (request: DecomposeRequest) => Promise<DesktopIpcResult<DecomposeResponse>>;
  readonly analyze: (request: AnalyzeRequest) => Promise<DesktopIpcResult<JudgementReport>>;
  readonly bundledFree: {
    readonly startWorkflow: (
      request: BundledFreeStartWorkflowRequest,
    ) => Promise<DesktopIpcResult<BundledFreeStartWorkflowResponse>>;
  };
}

export interface AnalyzeFlowParams {
  readonly workspaceDir: string;
  readonly requirement: string;
  readonly claim?: string;
  readonly confirmRequirementDecomposition: boolean;
  readonly providerMode: ProviderMode;
  readonly settings: {
    readonly ignore: readonly string[];
    readonly topK: number;
  };
}

export interface AnalyzeRequestSnapshot extends Omit<AnalyzeFlowParams, "api"> {
  readonly requestId: string;
  readonly locale: Locale;
  readonly templateId: ReportTemplateId;
  readonly startedAt: string;
  readonly workflowToken?: string;
}

export interface AnalyzeRequestSnapshotInput extends AnalyzeFlowParams {
  readonly locale: Locale;
  readonly templateId: ReportTemplateId;
}

export type AnalyzeFlowResult =
  | {
      readonly kind: "review";
      readonly decomposition: DecomposeResponse;
      readonly snapshot: AnalyzeRequestSnapshot;
    }
  | { readonly kind: "analyzed"; readonly report: JudgementReport }
  | { readonly kind: "error"; readonly error: AnalyzeFlowError };

export type ProceedAnalyzeResult =
  | { readonly kind: "analyzed"; readonly report: JudgementReport }
  | { readonly kind: "error"; readonly error: AnalyzeFlowError };

export type AnalyzeFlowError =
  | { readonly kind: "local-error"; readonly message: string }
  | { readonly kind: "provider-error"; readonly providerErrorKind: ProviderErrorKind };

export function createAnalyzeRequestSnapshot(
  input: AnalyzeRequestSnapshotInput,
): AnalyzeRequestSnapshot {
  const claim = input.claim?.trim();
  return Object.freeze({
    ...(claim === undefined || claim.length === 0 ? {} : { claim }),
    confirmRequirementDecomposition: input.confirmRequirementDecomposition,
    locale: input.locale,
    providerMode: input.providerMode,
    requestId: crypto.randomUUID(),
    requirement: input.requirement.trim(),
    settings: Object.freeze({
      ignore: Object.freeze([...input.settings.ignore]),
      topK: input.settings.topK,
    }),
    startedAt: new Date().toISOString(),
    templateId: input.templateId,
    workspaceDir: input.workspaceDir.trim(),
  });
}

export function createRetryAnalyzeRequestSnapshot(
  snapshot: AnalyzeRequestSnapshot,
): AnalyzeRequestSnapshot {
  return createAnalyzeRequestSnapshot({
    ...(snapshot.claim === undefined ? {} : { claim: snapshot.claim }),
    confirmRequirementDecomposition: snapshot.confirmRequirementDecomposition,
    locale: snapshot.locale,
    providerMode: snapshot.providerMode,
    requirement: snapshot.requirement,
    settings: snapshot.settings,
    templateId: snapshot.templateId,
    workspaceDir: snapshot.workspaceDir,
  });
}

export async function startAnalyzeFlow(params: {
  readonly api: AnalyzeFlowApi;
  readonly snapshot: AnalyzeRequestSnapshot;
}): Promise<AnalyzeFlowResult> {
  const { api, snapshot } = params;
  if (snapshot.workspaceDir.length === 0) {
    return { kind: "error", error: localError(snapshot.locale, "workspace") };
  }
  if (snapshot.requirement.length === 0) {
    return { kind: "error", error: localError(snapshot.locale, "requirement") };
  }
  const started = await startBundledFreeWorkflow(api, snapshot);
  if (!started.ok) return { kind: "error", error: analyzeFlowError(started.error) };
  const activeSnapshot = started.data;
  const decomposeResult = await api.decompose({
    locale: activeSnapshot.locale,
    requestId: activeSnapshot.requestId,
    workspaceDir: activeSnapshot.workspaceDir,
    requirement: activeSnapshot.requirement,
    ...(activeSnapshot.claim === undefined ? {} : { claim: activeSnapshot.claim }),
    options: { ignore: activeSnapshot.settings.ignore },
    ...(activeSnapshot.workflowToken === undefined
      ? {}
      : { workflowToken: activeSnapshot.workflowToken }),
  });
  if (!decomposeResult.ok) {
    return { kind: "error", error: analyzeFlowError(decomposeResult.error) };
  }
  if (activeSnapshot.confirmRequirementDecomposition) {
    return { kind: "review", decomposition: decomposeResult.data, snapshot: activeSnapshot };
  }
  return proceedAnalyze({ api, snapshot: activeSnapshot, decomposition: decomposeResult.data });
}

export async function proceedAnalyze(params: {
  readonly api: AnalyzeFlowApi;
  readonly snapshot: AnalyzeRequestSnapshot;
  readonly decomposition: DecomposeResponse;
}): Promise<ProceedAnalyzeResult> {
  const { api, snapshot, decomposition } = params;
  if (snapshot.workspaceDir.length === 0) {
    return { kind: "error", error: localError(snapshot.locale, "workspace") };
  }
  if (snapshot.requirement.length === 0) {
    return { kind: "error", error: localError(snapshot.locale, "requirement") };
  }
  const requirements = decomposition.requirements.filter((item) => item.text.trim().length > 0);
  if (requirements.length === 0) {
    return { kind: "error", error: localError(snapshot.locale, "remaining-requirement") };
  }
  const analyzeResult = await api.analyze({
    locale: snapshot.locale,
    requestId: snapshot.requestId,
    workspaceDir: snapshot.workspaceDir,
    requirement: snapshot.requirement,
    ...(snapshot.claim === undefined ? {} : { claim: snapshot.claim }),
    ...(snapshot.workflowToken === undefined ? {} : { workflowToken: snapshot.workflowToken }),
    requirements,
    claims: decomposition.claims.filter((item) => item.text.trim().length > 0),
    options: { ignore: snapshot.settings.ignore, topK: snapshot.settings.topK },
  });
  if (!analyzeResult.ok) {
    return { kind: "error", error: analyzeFlowError(analyzeResult.error) };
  }
  return { kind: "analyzed", report: analyzeResult.data };
}

async function startBundledFreeWorkflow(
  api: AnalyzeFlowApi,
  snapshot: AnalyzeRequestSnapshot,
): Promise<
  | { readonly ok: true; readonly data: AnalyzeRequestSnapshot }
  | { readonly ok: false; readonly error: DesktopIpcError }
> {
  if (snapshot.providerMode !== "bundled-free") return { ok: true, data: snapshot };
  const result = await api.bundledFree.startWorkflow({
    requestId: snapshot.requestId,
    workspaceDir: snapshot.workspaceDir,
    requirement: snapshot.requirement,
    ...(snapshot.claim === undefined ? {} : { claim: snapshot.claim }),
    ignore: snapshot.settings.ignore,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    data: Object.freeze({ ...snapshot, workflowToken: result.data.workflowToken }),
  };
}

function analyzeFlowError(error: DesktopIpcError): AnalyzeFlowError {
  if (error.code === "provider-error") {
    return { kind: "provider-error", providerErrorKind: error.providerErrorKind };
  }
  return { kind: "local-error", message: error.message };
}

function localError(
  locale: Locale,
  reason: "remaining-requirement" | "requirement" | "workspace",
): AnalyzeFlowError {
  const messages = {
    en: {
      "remaining-requirement": "Keep at least one requirement before continuing.",
      requirement: "Enter the requirements to check.",
      workspace: "Choose a valid project folder.",
    },
    "zh-CN": {
      "remaining-requirement": "请至少保留一条有效需求后再继续。",
      requirement: "请输入需要检查的需求。",
      workspace: "请选择有效的项目目录。",
    },
  } as const;
  return { kind: "local-error", message: messages[locale][reason] };
}
