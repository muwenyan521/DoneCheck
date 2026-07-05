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

const multiProvider: LLMProvider = {
  async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
    if (input.schemaName === "FileSelectionModelOutput") {
      return {
        object: input.schema.parse({
          candidateFiles: ["src/login.ts", "src/export.ts"],
          confidence: 0.9,
          reasoningSummary: "selected source files",
          warnings: [],
        }) as T,
        metadata: { provider: "mock", model: "mock", retries: 0 },
        usage: {},
      };
    }
    if (input.schemaName === "SemanticJudgementDraft") {
      const payload = JSON.parse(input.prompt.user) as {
        requirement: { id: string; text: string };
        claim?: { id: string; text: string };
      };
      const isLogin = payload.requirement.text.toLowerCase().includes("login");
      const filePath = isLogin
        ? "src/login.ts"
        : payload.requirement.text.toLowerCase().includes("export")
          ? "src/export.ts"
          : "src/todo.ts";
      return {
        object: input.schema.parse({
          confidence: 0.9,
          evidenceRefs: [
            {
              filePath,
              lineStart: 1,
              lineEnd: 1,
              snippetSummary: isLogin ? "login implementation" : "export placeholder",
            },
          ],
          explanation: isLogin ? "login is implemented" : "export is fake",
          judgementDraft: isLogin ? "fulfilled" : "partial",
          matchedClaimId: payload.claim?.id,
          matchedRequirementId: payload.requirement.id,
          repairSuggestion: isLogin ? "none" : "replace placeholder export",
        }) as T,
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
    const reportStaticSignals = result.report.judgements.flatMap(
      (judgement) => judgement.signals.staticSignals,
    );
    expect(reportStaticSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "src/login.ts", keyword: "localStorage" }),
      ]),
    );
    expect(result.fakeImplementationSignals.some((s) => s.pattern === "alert-only")).toBe(true);
    expect(result.selectedFiles).toContain("src/login.ts");
    expect(result.evidenceSnippets.length).toBeGreaterThan(0);
    expect(result.report.summaryStats["suspicious-fake-implementation"]).toBeGreaterThanOrEqual(0);
  });

  it("supports multi-item inputs and targets fake signals to related items", async () => {
    const result = await orchestrateAnalysis({
      requirement: "REQ-1: Implement login.\nREQ-3: Implement CSV export.",
      claim: "CLAIM-1: Login is implemented.\nCLAIM-3: CSV export is implemented.",
      requirements: [
        { id: "REQ-1", text: "Implement login." },
        { id: "REQ-3", text: "Implement CSV export." },
      ],
      claims: [
        { id: "CLAIM-1", text: "Login is implemented." },
        { id: "CLAIM-3", text: "CSV export is implemented." },
      ],
      files: [
        {
          relativePath: "src/login.ts",
          content: "export function login() { localStorage.setItem('x','1'); }",
        },
        {
          relativePath: "src/export.ts",
          content: "export function exportCsv() { alert('not implemented'); }",
        },
      ],
      provider: multiProvider,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });

    const login = result.report.judgements.find(
      (judgement) => judgement.id === "requirement:REQ-1",
    );
    const csv = result.report.judgements.find((judgement) => judgement.id === "requirement:REQ-3");
    expect(result.report.judgements.length).toBe(4);
    expect(login?.finalStatus).not.toBe("suspicious-fake-implementation");
    expect(csv?.finalStatus).toBe("suspicious-fake-implementation");
    expect(csv?.signals.fakeImplementationSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "src/export.ts", targetId: "REQ-3" }),
      ]),
    );
  });

  it("creates extra-scope candidates from unmatched additive claims", async () => {
    const result = await orchestrateAnalysis({
      requirement: "REQ-1: Implement todo tracking without billing controls.",
      claim:
        "CLAIM-1: Todo tracking is implemented.\nCLAIM-2: I also added subscription billing controls.",
      requirements: [{ id: "REQ-1", text: "Implement todo tracking without billing controls." }],
      claims: [
        { id: "CLAIM-1", text: "Todo tracking is implemented." },
        { id: "CLAIM-2", text: "I also added subscription billing controls." },
      ],
      files: [
        {
          relativePath: "src/todo.ts",
          content: "export function addTodo() { localStorage.setItem('todos','[]'); }",
        },
      ],
      provider: multiProvider,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });

    expect(result.report.summaryStats["extra-scope"]).toBe(1);
    expect(result.report.scopeDrift.extraScopeCount).toBe(1);
  });

  it("offers granular evidence snippets so exact provider evidence refs can pass validation", async () => {
    const result = await orchestrateAnalysis({
      requirement: "REQ-1: Implement login.",
      claim: "CLAIM-1: Login is implemented.",
      requirements: [{ id: "REQ-1", text: "Implement login." }],
      claims: [{ id: "CLAIM-1", text: "Login is implemented." }],
      files: [
        {
          relativePath: "src/login.ts",
          content: Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n"),
        },
      ],
      provider: {
        async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
          if (input.schemaName === "FileSelectionModelOutput") {
            return {
              object: input.schema.parse({ candidateFiles: ["src/login.ts"] }) as T,
              metadata: { provider: "mock", model: "mock", retries: 0 },
              usage: {},
            };
          }
          const payload = JSON.parse(input.prompt.user) as {
            evidenceSnippets: { filePath: string; lineEnd: number; lineStart: number }[];
          };
          const ref = payload.evidenceSnippets.find(
            (snippet) => snippet.filePath === "src/login.ts",
          );
          if (ref === undefined) throw new Error("missing selected login evidence");
          return {
            object: input.schema.parse({
              confidence: 0.9,
              evidenceRefs: [
                {
                  filePath: ref.filePath,
                  lineEnd: ref.lineEnd,
                  lineStart: ref.lineStart,
                  snippetSummary: "exact provider range",
                },
              ],
              explanation: "provider chose an exact subrange",
              judgementDraft: "fulfilled",
              matchedClaimId: "CLAIM-1",
              matchedRequirementId: "REQ-1",
              repairSuggestion: "none",
            }) as T,
            metadata: { provider: "mock", model: "mock", retries: 0 },
            usage: {},
          };
        },
      },
      generatedAt: "2026-06-28T00:00:00.000Z",
    });

    expect(result.evidenceSnippets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: "src/login.ts", lineStart: 8, lineEnd: 12 }),
      ]),
    );
    expect(result.report.judgements[0]?.evidenceRefs[0]?.filePath).toBe("src/login.ts");
  });

  it("deduplicates requirements and claims by id to avoid duplicate judgement ids", async () => {
    const result = await orchestrateAnalysis({
      requirement: "REQ-1: Implement login.",
      claim: "CLAIM-1: Login is implemented.",
      requirements: [
        { id: "REQ-1", text: "Implement login." },
        { id: "REQ-1", text: "Implement login." },
        { id: "REQ-1", text: "Implement login." },
      ],
      claims: [
        { id: "CLAIM-1", text: "Login is implemented." },
        { id: "CLAIM-1", text: "Login is implemented." },
      ],
      files: [
        {
          relativePath: "src/login.ts",
          content: "export function login() { localStorage.setItem('x','1'); }",
        },
      ],
      provider: multiProvider,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });

    const ids = result.report.judgements.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(result.report.judgements.filter((j) => j.id === "requirement:REQ-1").length).toBe(1);
    expect(result.report.judgements.filter((j) => j.id === "claim:CLAIM-1").length).toBe(1);
  });

  it("sends requirement-specific evidence subsets to semantic judgement", async () => {
    const capturedSemanticInputs: {
      readonly evidenceSnippetCount: number;
      readonly paths: string[];
      readonly requirementId: string;
    }[] = [];
    const files = [
      {
        relativePath: "src/login.ts",
        content: [
          "export function login() {",
          "  localStorage.setItem('session', 'ok');",
          ...Array.from({ length: 20 }, (_, index) => `  return authenticateUser(${index});`),
          "}",
        ].join("\n"),
      },
      {
        relativePath: "src/export.ts",
        content: [
          "export function exportCsv() {",
          "  alert('not implemented');",
          ...Array.from({ length: 20 }, (_, index) => `  return csvDownload(${index});`),
          "}",
        ].join("\n"),
      },
      {
        relativePath: "src/billing.ts",
        content: "export function billingControls() { return 'extra'; }",
      },
    ];
    const provider: LLMProvider = {
      async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
        if (input.schemaName === "FileSelectionModelOutput") {
          return {
            object: input.schema.parse({
              candidateFiles: ["src/login.ts", "src/export.ts", "src/billing.ts"],
            }) as T,
            metadata: { provider: "mock", model: "mock", retries: 0 },
            usage: {},
          };
        }
        if (input.schemaName === "SemanticJudgementDraft") {
          const payload = JSON.parse(input.prompt.user) as {
            evidenceSnippets: { filePath: string; lineEnd: number; lineStart: number }[];
            requirement: { id: string; text: string };
            claim?: { id: string };
          };
          capturedSemanticInputs.push({
            evidenceSnippetCount: payload.evidenceSnippets.length,
            paths: payload.evidenceSnippets.map((snippet) => snippet.filePath),
            requirementId: payload.requirement.id,
          });
          const isLogin = payload.requirement.id === "REQ-1";
          const targetPath = isLogin ? "src/login.ts" : "src/export.ts";
          const ref = payload.evidenceSnippets.find((snippet) => snippet.filePath === targetPath);
          if (ref === undefined) throw new Error(`missing selected evidence for ${targetPath}`);
          return {
            object: input.schema.parse({
              confidence: 0.9,
              evidenceRefs: [
                {
                  filePath: ref.filePath,
                  lineEnd: ref.lineEnd,
                  lineStart: ref.lineStart,
                  snippetSummary: isLogin ? "login evidence" : "export fake evidence",
                },
              ],
              explanation: isLogin ? "login evidence is present" : "export evidence is fake",
              judgementDraft: isLogin ? "fulfilled" : "suspicious",
              matchedClaimId: payload.claim?.id,
              matchedRequirementId: payload.requirement.id,
              repairSuggestion: isLogin
                ? "add an auth regression test"
                : "replace export placeholder",
            }) as T,
            metadata: { provider: "mock", model: "mock", retries: 0 },
            usage: {},
          };
        }
        throw new Error(`unexpected schema ${input.schemaName}`);
      },
    };

    const result = await orchestrateAnalysis({
      requirement: "REQ-1: Implement login.\nREQ-3: Implement CSV export.",
      claim:
        "CLAIM-1: Login is implemented.\nCLAIM-3: CSV export is implemented.\nCLAIM-5: I also added billing controls.",
      requirements: [
        { id: "REQ-1", text: "Implement login." },
        { id: "REQ-3", text: "Implement CSV export." },
      ],
      claims: [
        { id: "CLAIM-1", text: "Login is implemented." },
        { id: "CLAIM-3", text: "CSV export is implemented." },
        { id: "CLAIM-5", text: "I also added billing controls." },
      ],
      files,
      provider,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });

    const login = result.report.judgements.find(
      (judgement) => judgement.id === "requirement:REQ-1",
    );
    const csv = result.report.judgements.find((judgement) => judgement.id === "requirement:REQ-3");
    expect(capturedSemanticInputs.length).toBe(2);
    expect(
      Math.max(...capturedSemanticInputs.map((item) => item.evidenceSnippetCount)),
    ).toBeLessThan(result.evidenceSnippets.length);
    expect(
      Math.max(...capturedSemanticInputs.map((item) => item.evidenceSnippetCount)),
    ).toBeLessThanOrEqual(16);
    expect(capturedSemanticInputs.find((item) => item.requirementId === "REQ-1")?.paths).toContain(
      "src/login.ts",
    );
    expect(capturedSemanticInputs.find((item) => item.requirementId === "REQ-3")?.paths).toContain(
      "src/export.ts",
    );
    expect(login?.finalStatus).not.toBe("suspicious-fake-implementation");
    expect(csv?.finalStatus).toBe("suspicious-fake-implementation");
    expect(result.report.scopeDrift.extraScopeCount).toBeGreaterThan(0);
  });

  it("keeps semantic judgement calls aligned with stabilized explicit requirements", async () => {
    const semanticCalls: string[] = [];
    const provider: LLMProvider = {
      async generateObject<T>(input: GenerateObjectInput<T>): Promise<GenerateObjectResult<T>> {
        if (input.schemaName === "FileSelectionModelOutput") {
          return {
            object: input.schema.parse({ candidateFiles: ["src/app.ts"] }) as T,
            metadata: { provider: "mock", model: "mock", retries: 0 },
            usage: {},
          };
        }
        if (input.schemaName === "SemanticJudgementDraft") {
          const payload = JSON.parse(input.prompt.user) as {
            evidenceSnippets: { filePath: string; lineEnd: number; lineStart: number }[];
            requirement: { id: string };
          };
          semanticCalls.push(payload.requirement.id);
          const ref = payload.evidenceSnippets[0];
          if (ref === undefined) throw new Error("missing evidence");
          return {
            object: input.schema.parse({
              confidence: 0.9,
              evidenceRefs: [
                {
                  filePath: ref.filePath,
                  lineEnd: ref.lineEnd,
                  lineStart: ref.lineStart,
                  snippetSummary: "app evidence",
                },
              ],
              explanation: "implemented",
              judgementDraft: "fulfilled",
              matchedRequirementId: payload.requirement.id,
              repairSuggestion: "none",
            }) as T,
            metadata: { provider: "mock", model: "mock", retries: 0 },
            usage: {},
          };
        }
        throw new Error(`unexpected schema ${input.schemaName}`);
      },
    };

    const result = await orchestrateAnalysis({
      requirement: "raw requirements",
      claim: "raw claims",
      requirements: [
        { id: "REQ-1", text: "Create an auth session, persist it, and show the signed-in user." },
        { id: "REQ-2", text: "Add todos, persist them, and restore them." },
        { id: "REQ-3", text: "Export todos as CSV and show a confirmation." },
        { id: "REQ-4", text: "Display validation errors and keep input intact." },
        { id: "REQ-5", text: "Keep loading UI responsive and accessible." },
      ],
      claims: [
        { id: "CLAIM-1", text: "Auth is implemented." },
        { id: "CLAIM-2", text: "Todos are implemented." },
        { id: "CLAIM-3", text: "Export is implemented." },
        { id: "CLAIM-4", text: "Validation is implemented." },
        { id: "CLAIM-5", text: "Loading UI is implemented." },
      ],
      files: [
        {
          relativePath: "src/app.ts",
          content: "export const app = () => localStorage.getItem('session');",
        },
      ],
      provider,
      generatedAt: "2026-06-28T00:00:00.000Z",
    });

    expect(semanticCalls).toEqual(["REQ-1", "REQ-2", "REQ-3", "REQ-4", "REQ-5"]);
    expect(semanticCalls.length).toBe(
      result.report.judgements.filter((j) => j.id.startsWith("requirement:")).length,
    );
    expect(semanticCalls.length).toBeLessThan(10);
  });
});
