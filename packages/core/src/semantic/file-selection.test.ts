import { describe, expect, it } from "vitest";
import { selectCandidateFiles } from "./file-selection.js";
import type { LLMProvider } from "./provider.js";

const projectFiles = [
  "src/auth/login.ts",
  "src/auth/session.ts",
  "src/ui/login-form.tsx",
  "README.md",
] as const;

function providerReturning(output: unknown): LLMProvider {
  return {
    async generateObject({ schema }) {
      return {
        metadata: {
          model: "mock-model",
          provider: "mock",
          retries: 0,
        },
        object: schema.parse(output),
        usage: {
          inputTokens: 12,
          outputTokens: 8,
          totalTokens: 20,
        },
      };
    },
  };
}

describe("selectCandidateFiles", () => {
  it("returns normalized existing LLM-selected candidate files", async () => {
    const result = await selectCandidateFiles({
      provider: providerReturning({
        candidateFiles: ["./src/auth/login.ts", "src/auth/login.ts", "src/ui/login-form.tsx"],
        confidence: 0.82,
        reasoningSummary: "Login and form files are likely relevant.",
        warnings: [],
      }),
      projectFiles,
      requirement: "Implement auth login flow.",
      structureSummary: "src/auth/login.ts\nsrc/ui/login-form.tsx",
      topK: 10,
    });

    expect(result.candidateFiles).toEqual(["src/auth/login.ts", "src/ui/login-form.tsx"]);
    expect(result.llmSelected).toEqual(["src/auth/login.ts", "src/ui/login-form.tsx"]);
    expect(result.staticallyRecalled).toEqual([]);
    expect(result.confidence).toBe(0.82);
    expect(result.providerMetadata).toEqual({ model: "mock-model", provider: "mock", retries: 0 });
  });

  it("rejects invalid model output before postprocessing", async () => {
    await expect(
      selectCandidateFiles({
        provider: providerReturning({ candidateFiles: "src/auth/login.ts" }),
        projectFiles,
        requirement: "Implement auth login flow.",
        structureSummary: "src/auth/login.ts",
        topK: 10,
      }),
    ).rejects.toThrow();
  });

  it("filters paths that are not present in the project file list", async () => {
    const result = await selectCandidateFiles({
      provider: providerReturning({
        candidateFiles: ["src/auth/login.ts", "src/missing.ts"],
        warnings: [],
      }),
      projectFiles,
      requirement: "Implement auth login flow.",
      structureSummary: "src/auth/login.ts",
      topK: 10,
    });

    expect(result.candidateFiles).toEqual(["src/auth/login.ts"]);
    expect(result.warnings).toContain("Filtered non-existing LLM candidate: src/missing.ts");
  });

  it("keeps combined model and static candidates within topK", async () => {
    const result = await selectCandidateFiles({
      provider: providerReturning({
        candidateFiles: ["src/auth/login.ts", "src/ui/login-form.tsx"],
        warnings: [],
      }),
      projectFiles,
      requirement: "Implement auth login flow.",
      staticSignals: [
        { filePath: "src/auth/session.ts", keyword: "auth", strength: "strong" },
        { filePath: "README.md", keyword: "auth", strength: "strong" },
      ],
      structureSummary: "src/auth/login.ts\nsrc/ui/login-form.tsx\nsrc/auth/session.ts",
      topK: 3,
    });

    expect(result.llmSelected).toEqual(["src/auth/login.ts", "src/ui/login-form.tsx"]);
    expect(result.staticallyRecalled).toEqual(["src/auth/session.ts"]);
    expect(result.candidateFiles).toEqual([
      "src/auth/login.ts",
      "src/ui/login-form.tsx",
      "src/auth/session.ts",
    ]);
    expect(result.warnings).toContain("Static recall truncated to preserve topK=3.");
  });

  it("does not append static recall when model candidates consume topK", async () => {
    const result = await selectCandidateFiles({
      provider: providerReturning({
        candidateFiles: ["src/auth/login.ts", "src/ui/login-form.tsx", "README.md"],
        warnings: [],
      }),
      projectFiles,
      requirement: "Implement auth login flow.",
      staticSignals: [
        { filePath: "src/auth/session.ts", keyword: "localStorage", strength: "strong" },
      ],
      structureSummary: "src/auth/login.ts\nsrc/ui/login-form.tsx\nsrc/auth/session.ts",
      topK: 2,
    });

    expect(result.llmSelected).toEqual(["src/auth/login.ts", "src/ui/login-form.tsx"]);
    expect(result.staticallyRecalled).toEqual([]);
    expect(result.candidateFiles).toEqual(["src/auth/login.ts", "src/ui/login-form.tsx"]);
    expect(result.warnings).toContain("LLM candidate list truncated to topK=2.");
    expect(result.warnings).toContain("Static recall truncated to preserve topK=2.");
  });

  it("rejects invalid provider output at the business layer when provider skips schema validation", async () => {
    const rawProvider: LLMProvider = {
      async generateObject<T>() {
        return {
          metadata: { model: "mock-model", provider: "mock", retries: 0 },
          object: { candidateFiles: "not-an-array" } as unknown as T,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
      },
    };

    await expect(
      selectCandidateFiles({
        provider: rawProvider,
        projectFiles,
        requirement: "Implement auth login flow.",
        structureSummary: "src/auth/login.ts",
        topK: 10,
      }),
    ).rejects.toThrow();
  });

  it("force-adds strong static signal files missed by the LLM", async () => {
    const result = await selectCandidateFiles({
      provider: providerReturning({
        candidateFiles: ["src/ui/login-form.tsx"],
        warnings: [],
      }),
      projectFiles,
      requirement: "Persist auth state in localStorage.",
      staticSignals: [
        { filePath: "src/auth/session.ts", keyword: "localStorage", strength: "strong" },
        { filePath: "src/auth/login.ts", keyword: "auth", strength: "weak" },
      ],
      structureSummary: "src/auth/session.ts\nsrc/ui/login-form.tsx",
      topK: 10,
    });

    expect(result.llmSelected).toEqual(["src/ui/login-form.tsx"]);
    expect(result.staticallyRecalled).toEqual(["src/auth/session.ts"]);
    expect(result.candidateFiles).toEqual(["src/ui/login-form.tsx", "src/auth/session.ts"]);
  });
});
