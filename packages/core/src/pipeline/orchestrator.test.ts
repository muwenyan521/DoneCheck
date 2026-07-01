import { describe, expect, it } from "vitest";
import type {
  GenerateObjectInput,
  GenerateObjectResult,
  LLMProvider,
} from "../semantic/provider.js";
import { orchestrateAnalysis } from "./orchestrator.js";

const mockProvider: LLMProvider = {
  async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
    if (input.schemaName === "FileSelectionModelOutput") {
      return {
        object: {
          candidateFiles: ["src/login.ts"],
          confidence: 0.9,
          reasoningSummary: "login form mentioned in claim",
          warnings: [],
        } as unknown as T,
        metadata: { provider: "mock", model: "mock", retries: 0 },
        usage: {},
      };
    }
    if (input.schemaName === "SemanticJudgementDraft") {
      return {
        object: {
          confidence: 0.8,
          evidenceRefs: [
            {
              filePath: "src/login.ts",
              lineStart: 1,
              lineEnd: 1,
              snippetSummary: "login function with alert + not implemented",
            },
          ],
          explanation: "alert() and 'not implemented' placeholder detected",
          judgementDraft: "suspicious",
          matchedRequirementId: "REQ-1",
          repairSuggestion: "implement real backend call",
        } as unknown as T,
        metadata: { provider: "mock", model: "mock", retries: 0 },
        usage: {},
      };
    }
    throw new Error(`unexpected schema ${input.schemaName}`);
  },
};

describe("orchestrateAnalysis", () => {
  it("chains static-signals + selection + drafting + rules", async () => {
    const result = await orchestrateAnalysis({
      requirement: "REQ-1: User can log in.",
      claim: "CLAIM-1: login form in src/login.ts.",
      files: [
        {
          relativePath: "src/login.ts",
          content:
            "export function login() { localStorage.setItem('x','1'); alert('x'); throw new Error('not implemented'); }",
        },
        {
          relativePath: "src/empty.ts",
          content: "export const x = () => {};",
        },
      ],
      provider: mockProvider,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });

    expect(result.report.version).toBe("rules-v1");
    expect(result.report.judgements.length).toBeGreaterThan(0);
    expect(result.staticSignals.length).toBeGreaterThan(0);
    expect(result.fakeImplementationSignals.some((s) => s.pattern === "alert-only")).toBe(true);
    expect(result.selectedFiles).toContain("src/login.ts");
    expect(result.evidenceSnippets.length).toBeGreaterThan(0);
    expect(result.report.summaryStats["suspicious-fake-implementation"]).toBeGreaterThanOrEqual(0);
  });
});
