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
    if (input.schemaName === "RequirementDecompositionOutput") {
      return {
        object: {
          claims: [{ id: "CLAIM-1", text: "Login form is implemented in src/login.ts." }],
          confidence: 0.9,
          requirements: [{ id: "REQ-1", text: "User can log in with email and password." }],
        } as unknown as T,
        metadata: { provider: "stub", model: "stub", retries: 0 },
        usage: {},
      };
    }
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
    const payload = JSON.parse(input.prompt.user) as {
      evidenceSnippets: { filePath: string; lineEnd: number; lineStart: number }[];
    };
    const ref = payload.evidenceSnippets.find((snippet) => snippet.filePath === "src/login.ts");
    if (ref === undefined) throw new Error("missing selected login evidence");
    return {
      object: {
        confidence: 0.6,
        evidenceRefs: [
          {
            filePath: ref.filePath,
            lineStart: ref.lineStart,
            lineEnd: ref.lineEnd,
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

  it("accepts explicit multi-item requirements and claims", async () => {
    const result = await runDoneCheckPipelineNode({
      workspacePath: FIXTURE_DIR,
      requirement: "raw requirement text",
      claim: "raw claim text",
      requirements: [
        { id: "REQ-1", text: "User can log in with email and password." },
        { id: "REQ-2", text: "User can export CSV." },
      ],
      claims: [
        { id: "CLAIM-1", text: "Login form is implemented in src/login.ts." },
        { id: "CLAIM-2", text: "CSV export is implemented." },
      ],
      provider: stubProvider,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });

    expect(result.report.judgements.map((judgement) => judgement.id)).toEqual(
      expect.arrayContaining(["requirement:REQ-1", "requirement:REQ-2"]),
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

  it("keeps fixture semantic calls close to explicit requirement count after decomposition stabilization", async () => {
    const semanticCalls: string[] = [];
    const fixtureProvider: LLMProvider = {
      async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
        if (input.schemaName === "FileSelectionModelOutput") {
          return {
            object: input.schema.parse({
              candidateFiles: [
                "src/components/LoginForm.tsx",
                "src/components/TodoList.tsx",
                "src/components/ExportButton.tsx",
                "src/components/BillingPanel.tsx",
                "src/lib/auth.ts",
              ],
              confidence: 0.9,
              reasoningSummary: "selected fixture files",
              warnings: [],
            }) as T,
            metadata: { provider: "stub", model: "stub", retries: 0 },
            usage: {},
          };
        }
        const payload = JSON.parse(input.prompt.user) as {
          evidenceSnippets: { filePath: string; lineEnd: number; lineStart: number }[];
          requirement: { id: string };
          claim?: { id: string };
        };
        semanticCalls.push(payload.requirement.id);
        if (payload.evidenceSnippets.length === 0) {
          throw new Error(`missing fixture evidence for ${payload.requirement.id}`);
        }
        const ref = payload.evidenceSnippets[0] as {
          filePath: string;
          lineEnd: number;
          lineStart: number;
        };
        return {
          object: input.schema.parse({
            confidence: 0.9,
            evidenceRefs: [
              {
                filePath: ref.filePath,
                lineEnd: ref.lineEnd,
                lineStart: ref.lineStart,
                snippetSummary: "fixture evidence",
              },
            ],
            explanation: "fixture judgement",
            judgementDraft: payload.requirement.id === "REQ-3" ? "suspicious" : "fulfilled",
            matchedClaimId: payload.requirement.id === "REQ-3" ? undefined : payload.claim?.id,
            matchedRequirementId: payload.requirement.id,
            repairSuggestion:
              payload.requirement.id === "REQ-3" ? "replace placeholder export" : "none",
          }) as T,
          metadata: { provider: "stub", model: "stub", retries: 0 },
          usage: {},
        };
      },
    };

    const result = await runDoneCheckPipelineNode({
      workspacePath: FIXTURE_DIR,
      requirement: "REQ-1: Login behavior.",
      claim: "CLAIM-1: Login behavior is implemented.",
      requirements: [
        { id: "REQ-1", text: "Auth session behavior." },
        { id: "REQ-2", text: "Todo behavior." },
        { id: "REQ-3", text: "Export button behavior." },
        { id: "REQ-4", text: "Login responsive behavior." },
        { id: "REQ-5", text: "Login test evidence." },
      ],
      claims: [
        { id: "CLAIM-1", text: "Auth session behavior is implemented." },
        { id: "CLAIM-2", text: "Todo behavior is implemented." },
        { id: "CLAIM-3", text: "Export button behavior is implemented." },
        { id: "CLAIM-4", text: "Responsive behavior is implemented." },
        { id: "CLAIM-5", text: "I also added extra billing behavior." },
      ],
      provider: fixtureProvider,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });

    const ids = result.report.judgements.map((judgement) => judgement.id);
    const refs = result.report.judgements.flatMap((judgement) => judgement.evidenceRefs);
    expect(semanticCalls).toEqual(["REQ-1", "REQ-2", "REQ-3", "REQ-4", "REQ-5"]);
    expect(semanticCalls.length).toBeLessThan(10);
    expect(new Set(ids).size).toBe(result.report.judgements.length);
    expect(refs.map((ref) => ref.filePath)).not.toEqual(
      expect.arrayContaining(["README.md", "requirements.md", "claim.md"]),
    );
    expect(
      result.report.judgements.find((judgement) => judgement.id === "requirement:REQ-1")
        ?.finalStatus,
    ).not.toBe("suspicious-fake-implementation");
    expect(
      result.report.judgements.find((judgement) => judgement.id === "requirement:REQ-3")
        ?.semanticDraft?.judgementDraft,
    ).toBe("suspicious");
    expect(result.report.scopeDrift.extraScopeCount).toBeGreaterThan(0);
  });
});
