import { describe, expect, it } from "vitest";
import type {
  AnalyzeRequest,
  DecomposeRequest,
  DecomposeResponse,
  DesktopIpcResult,
  JudgementReport,
} from "../ipc-contract.js";
import { createAnalyzeRequestSnapshot, proceedAnalyze, startAnalyzeFlow } from "./analyze-flow.js";

const decomposition: DecomposeResponse = {
  assumptions: [],
  claims: [{ id: "CLAIM-1", text: "login stores token" }],
  clarifyingQuestions: [],
  requirements: [{ id: "REQ-1", text: "User can log in." }],
  warnings: [],
};
const report = { judgements: [] } as unknown as JudgementReport;

function createSpy() {
  const decomposeCalls: DecomposeRequest[] = [];
  const analyzeCalls: AnalyzeRequest[] = [];
  return {
    decomposeCalls,
    analyzeCalls,
    decompose: async (request: DecomposeRequest): Promise<DesktopIpcResult<DecomposeResponse>> => {
      decomposeCalls.push(request);
      return { ok: true, data: decomposition };
    },
    analyze: async (request: AnalyzeRequest): Promise<DesktopIpcResult<JudgementReport>> => {
      analyzeCalls.push(request);
      return { ok: true, data: report };
    },
  };
}

function snapshot(overrides: Partial<Parameters<typeof createAnalyzeRequestSnapshot>[0]> = {}) {
  return createAnalyzeRequestSnapshot({
    claim: "  implemented login  ",
    confirmRequirementDecomposition: true,
    locale: "zh-CN",
    requirement: "  Users can log in.  ",
    settings: { ignore: ["dist"], topK: 5 },
    templateId: "generic",
    workspaceDir: "  /workspace/demo  ",
    ...overrides,
  });
}

describe("analysis request snapshots", () => {
  it("freezes and normalizes every value that defines one run", () => {
    const ignore = ["dist"];
    const value = snapshot({ settings: { ignore, topK: 5 } });
    ignore.push("coverage");
    expect(value).toMatchObject({
      workspaceDir: "/workspace/demo",
      requirement: "Users can log in.",
      claim: "implemented login",
    });
    expect(value.settings.ignore).toEqual(["dist"]);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.settings.ignore)).toBe(true);
    expect(value.requestId).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it("returns the exact snapshot with review and never analyzes early", async () => {
    const api = createSpy();
    const value = snapshot();
    const result = await startAnalyzeFlow({ api, snapshot: value });
    expect(result).toEqual({ kind: "review", decomposition, snapshot: value });
    expect(api.decomposeCalls[0]?.requestId).toBe(value.requestId);
    expect(api.analyzeCalls).toHaveLength(0);
  });

  it("uses the frozen snapshot with edited decomposition", async () => {
    const api = createSpy();
    const value = snapshot();
    const edited = {
      ...decomposition,
      requirements: [{ id: "REQ-1", text: "Edited requirement" }],
    };
    const result = await proceedAnalyze({ api, snapshot: value, decomposition: edited });
    expect(result).toEqual({ kind: "analyzed", report });
    expect(api.analyzeCalls[0]).toEqual(
      expect.objectContaining({
        requestId: value.requestId,
        workspaceDir: "/workspace/demo",
        requirement: "Users can log in.",
        requirements: edited.requirements,
      }),
    );
  });

  it("rejects empty boundary values and empty edited requirements", async () => {
    const api = createSpy();
    await expect(
      startAnalyzeFlow({ api, snapshot: snapshot({ workspaceDir: " " }) }),
    ).resolves.toMatchObject({ kind: "error" });
    await expect(
      startAnalyzeFlow({ api, snapshot: snapshot({ requirement: " " }) }),
    ).resolves.toMatchObject({ kind: "error" });
    await expect(
      proceedAnalyze({
        api,
        snapshot: snapshot(),
        decomposition: { ...decomposition, requirements: [] },
      }),
    ).resolves.toEqual({
      kind: "error",
      error: {
        kind: "local-error",
        message: "请至少保留一条有效需求后再继续。",
      },
    });
    expect(api.decomposeCalls).toHaveLength(0);
    expect(api.analyzeCalls).toHaveLength(0);
  });

  it("continues directly when review is disabled", async () => {
    const api = createSpy();
    const result = await startAnalyzeFlow({
      api,
      snapshot: snapshot({ confirmRequirementDecomposition: false }),
    });
    expect(result).toEqual({ kind: "analyzed", report });
    expect(api.analyzeCalls).toHaveLength(1);
  });
});
