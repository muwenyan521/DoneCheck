import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type {
  GenerateObjectInput,
  GenerateObjectResult,
  LLMProvider,
} from "../semantic/provider.js";
import { runDoneCheckPipelineNode } from "./node-adapter.js";

const FIXTURE_DIR = resolve(fileURLToPath(import.meta.url), "..", "__fixtures__", "sample-project");

const stubProvider: LLMProvider = {
  async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
    if (input.schemaName === "FileSelectionModelOutput") {
      return {
        object: {
          candidateFiles: ["src/login.ts"],
          confidence: 0.95,
          reasoningSummary: "login form referenced in claim",
          warnings: [],
        } as unknown as T,
        metadata: { provider: "stub", model: "stub", retries: 0 },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      };
    }
    return {
      object: {
        confidence: 0.6,
        evidenceRefs: [
          {
            filePath: "src/login.ts",
            lineStart: 1,
            lineEnd: 6,
            snippetSummary: "login with localStorage + alert + not implemented placeholder",
          },
        ],
        explanation: "alert() and 'not implemented' placeholder detected",
        judgementDraft: "suspicious",
        matchedRequirementId: "REQ-1",
        repairSuggestion: "replace alert + implement backend call",
      } as unknown as T,
      metadata: { provider: "stub", model: "stub", retries: 0 },
      usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
    };
  },
};

describe("runDoneCheckPipelineNode", () => {
  it("reads fixture from disk and produces a report", async () => {
    const result = await runDoneCheckPipelineNode({
      workspacePath: FIXTURE_DIR,
      requirement: "REQ-1: User can log in.",
      claim: "CLAIM-1: login in src/login.ts.",
      provider: stubProvider,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    expect(result.report.version).toBe("rules-v1");
    expect(result.fakeImplementationSignals.some((s) => s.pattern === "alert-only")).toBe(true);
    expect(result.fakeImplementationSignals.some((s) => s.pattern === "not-implemented")).toBe(
      true,
    );
  });
});

describe("e2e: full pipeline over sample-project fixture", () => {
  it("produces a JudgementReport with fake-impl signals", async () => {
    const result = await runDoneCheckPipelineNode({
      workspacePath: FIXTURE_DIR,
      requirement: "REQ-1: User can log in with email and password.",
      claim: "CLAIM-1: Login form is implemented in src/login.ts.",
      provider: stubProvider,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });
    expect(result.report.version).toBe("rules-v1");
    expect(result.report.judgements.length).toBeGreaterThan(0);
    expect(result.fakeImplementationSignals.length).toBeGreaterThanOrEqual(2);
    const patterns = result.fakeImplementationSignals.map((s) => s.pattern);
    expect(patterns).toContain("alert-only");
    expect(patterns).toContain("not-implemented");
    expect(result.selectedFiles).toContain("src/login.ts");
    expect(result.staticSignals.some((s) => s.keyword === "localStorage")).toBe(true);
    const reportStaticSignals = result.report.judgements.flatMap(
      (judgement) => judgement.signals.staticSignals,
    );
    expect(reportStaticSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "src/login.ts", keyword: "localStorage" }),
      ]),
    );
  });
});
