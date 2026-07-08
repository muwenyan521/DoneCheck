import { describe, expect, it } from "vitest";
import type { AnalyzeRequest, DecomposeRequest, DecomposeResponse } from "../ipc-contract.js";
import type { DesktopIpcResult, JudgementReport } from "../ipc-contract.js";
import { proceedAnalyze, startAnalyzeFlow } from "./analyze-flow.js";

interface SpyApi {
  readonly decompose: (req: DecomposeRequest) => Promise<DesktopIpcResult<DecomposeResponse>>;
  readonly analyze: (req: AnalyzeRequest) => Promise<DesktopIpcResult<JudgementReport>>;
  readonly decomposeCalls: DecomposeRequest[];
  readonly analyzeCalls: AnalyzeRequest[];
}

function createSpyApi(options: {
  readonly decomposition: DecomposeResponse;
  readonly report?: JudgementReport;
  readonly decomposeError?: string;
  readonly analyzeError?: string;
}): SpyApi {
  const decomposeCalls: DecomposeRequest[] = [];
  const analyzeCalls: AnalyzeRequest[] = [];
  return {
    analyzeCalls,
    decomposeCalls,
    analyze: async (req) => {
      analyzeCalls.push(req);
      if (options.analyzeError !== undefined) {
        return { ok: false, error: { code: "unknown", message: options.analyzeError } };
      }
      if (options.report === undefined) throw new Error("report not configured");
      return { ok: true, data: options.report };
    },
    decompose: async (req) => {
      decomposeCalls.push(req);
      if (options.decomposeError !== undefined) {
        return { ok: false, error: { code: "unknown", message: options.decomposeError } };
      }
      return { ok: true, data: options.decomposition };
    },
  };
}

const sampleDecomposition: DecomposeResponse = {
  assumptions: ["login assumes cookie available"],
  claims: [
    { id: "CLAIM-1", text: "login stores token" },
    { id: "CLAIM-2", text: "logout clears token" },
  ],
  clarifyingQuestions: ["Should logout clear cookies?"],
  requirements: [
    { id: "REQ-1", text: "User can log in." },
    { id: "REQ-2", text: "User can log out." },
    { id: "REQ-3", text: "Session expires after 30 minutes." },
  ],
  warnings: ["REQ-3 has no matching claim"],
};

const sampleReport = {
  claimCoverage: { denominator: 2, excludedInsufficientEvidence: 0, score: 1, totalItems: 2 },
  generatedAt: "2026-07-01T00:00:00.000Z",
  judgements: [],
  requirementCoverage: { denominator: 3, excludedInsufficientEvidence: 0, score: 1, totalItems: 3 },
  scopeDrift: { extraScopeCount: 0, level: "none", score: 0 },
  summaryStats: {},
  version: "rules-v1",
  warnings: [],
} as unknown as JudgementReport;

describe("startAnalyzeFlow", () => {
  it("decomposes then analyzes with requirements and claims when review is off", async () => {
    const spy = createSpyApi({
      decomposition: sampleDecomposition,
      report: sampleReport,
    });
    const result = await startAnalyzeFlow({
      api: spy,
      claim: "login stores token in localStorage",
      confirmRequirementDecomposition: false,
      requirement: "User can log in and persist a session.",
      settings: { ignore: ["dist"], topK: 5 },
      workspaceDir: "/workspace/demo",
    });

    expect(result.kind).toBe("analyzed");
    if (result.kind !== "analyzed") throw new Error(`expected analyzed, got ${result.kind}`);
    expect(result.report).toBe(sampleReport);
    expect(spy.decomposeCalls).toHaveLength(1);
    expect(spy.decomposeCalls[0]).toEqual({
      workspaceDir: "/workspace/demo",
      requirement: "User can log in and persist a session.",
      claim: "login stores token in localStorage",
    });
    expect(spy.analyzeCalls).toHaveLength(1);
    expect(spy.analyzeCalls[0]).toEqual({
      workspaceDir: "/workspace/demo",
      requirement: "User can log in and persist a session.",
      claim: "login stores token in localStorage",
      requirements: sampleDecomposition.requirements,
      claims: sampleDecomposition.claims,
      options: { ignore: ["dist"], topK: 5 },
    });
  });

  it("returns review without analyzing when confirmRequirementDecomposition is on", async () => {
    const spy = createSpyApi({
      decomposition: sampleDecomposition,
      report: sampleReport,
    });
    const result = await startAnalyzeFlow({
      api: spy,
      confirmRequirementDecomposition: true,
      requirement: "User can log in.",
      settings: { ignore: [], topK: 5 },
      workspaceDir: "/workspace/demo",
    });

    expect(result.kind).toBe("review");
    if (result.kind !== "review") throw new Error(`expected review, got ${result.kind}`);
    expect(result.decomposition).toBe(sampleDecomposition);
    expect(spy.decomposeCalls).toHaveLength(1);
    expect(spy.analyzeCalls).toHaveLength(0);
  });

  it("does not analyze when decompose fails", async () => {
    const spy = createSpyApi({
      decomposition: sampleDecomposition,
      decomposeError: "decomposition provider failure",
    });
    const result = await startAnalyzeFlow({
      api: spy,
      confirmRequirementDecomposition: false,
      requirement: "User can log in.",
      settings: { ignore: [], topK: 5 },
      workspaceDir: "/workspace/demo",
    });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error(`expected error, got ${result.kind}`);
    expect(result.error).toBe("decomposition provider failure");
    expect(spy.analyzeCalls).toHaveLength(0);
  });
});

describe("proceedAnalyze", () => {
  it("passes decomposition requirements and claims to analyze", async () => {
    const spy = createSpyApi({
      decomposition: sampleDecomposition,
      report: sampleReport,
    });
    const result = await proceedAnalyze(
      {
        api: spy,
        claim: "login stores token",
        confirmRequirementDecomposition: true,
        requirement: "User can log in.",
        settings: { ignore: ["dist"], topK: 3 },
        workspaceDir: "/workspace/demo",
      },
      sampleDecomposition,
    );

    expect(result.kind).toBe("analyzed");
    if (result.kind !== "analyzed") throw new Error(`expected analyzed, got ${result.kind}`);
    expect(result.report).toBe(sampleReport);
    expect(spy.analyzeCalls).toHaveLength(1);
    expect(spy.analyzeCalls[0]?.requirements).toBe(sampleDecomposition.requirements);
    expect(spy.analyzeCalls[0]?.claims).toBe(sampleDecomposition.claims);
  });

  it("returns error without report when analyze fails", async () => {
    const spy = createSpyApi({
      decomposition: sampleDecomposition,
      analyzeError: "analyze provider failure",
    });
    const result = await proceedAnalyze(
      {
        api: spy,
        confirmRequirementDecomposition: false,
        requirement: "User can log in.",
        settings: { ignore: [], topK: 5 },
        workspaceDir: "/workspace/demo",
      },
      sampleDecomposition,
    );

    expect(result.kind).toBe("error");
    if (result.kind !== "error") throw new Error(`expected error, got ${result.kind}`);
    expect(result.error).toBe("analyze provider failure");
  });
});
