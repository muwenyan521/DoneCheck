import type {
  AnalyzeRequest,
  DecomposeRequest,
  DecomposeResponse,
  DesktopIpcResult,
  JudgementReport,
} from "../ipc-contract.js";

export interface AnalyzeFlowApi {
  readonly decompose: (request: DecomposeRequest) => Promise<DesktopIpcResult<DecomposeResponse>>;
  readonly analyze: (request: AnalyzeRequest) => Promise<DesktopIpcResult<JudgementReport>>;
}

export interface AnalyzeFlowParams {
  readonly api: AnalyzeFlowApi;
  readonly workspaceDir: string;
  readonly requirement: string;
  readonly claim?: string;
  readonly confirmRequirementDecomposition: boolean;
  readonly settings: {
    readonly ignore: readonly string[];
    readonly topK: number;
  };
}

export type AnalyzeFlowResult =
  | { readonly kind: "review"; readonly decomposition: DecomposeResponse }
  | { readonly kind: "analyzed"; readonly report: JudgementReport }
  | { readonly kind: "error"; readonly error: string };

export type ProceedAnalyzeResult =
  | { readonly kind: "analyzed"; readonly report: JudgementReport }
  | { readonly kind: "error"; readonly error: string };

export async function startAnalyzeFlow(params: AnalyzeFlowParams): Promise<AnalyzeFlowResult> {
  const decomposeResult = await params.api.decompose({
    workspaceDir: params.workspaceDir,
    requirement: params.requirement,
    ...(params.claim === undefined ? {} : { claim: params.claim }),
  });
  if (!decomposeResult.ok) {
    return { kind: "error", error: decomposeResult.error.message };
  }
  if (params.confirmRequirementDecomposition) {
    return { kind: "review", decomposition: decomposeResult.data };
  }
  return proceedAnalyze(params, decomposeResult.data);
}

export async function proceedAnalyze(
  params: AnalyzeFlowParams,
  decomposition: DecomposeResponse,
): Promise<ProceedAnalyzeResult> {
  const analyzeResult = await params.api.analyze({
    workspaceDir: params.workspaceDir,
    requirement: params.requirement,
    ...(params.claim === undefined ? {} : { claim: params.claim }),
    requirements: decomposition.requirements,
    claims: decomposition.claims,
    options: { ignore: params.settings.ignore, topK: params.settings.topK },
  });
  if (!analyzeResult.ok) {
    return { kind: "error", error: analyzeResult.error.message };
  }
  return { kind: "analyzed", report: analyzeResult.data };
}
