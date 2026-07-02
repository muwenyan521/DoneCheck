import { describe, expect, it } from "vitest";
import {
  OpenAIProvider,
  ProviderConfigError,
  createDeterministicMockProvider,
  createProvider,
  resolveOpenAIProviderConfig,
} from "./index.js";

describe("OpenAIProvider", () => {
  it("throws ProviderConfigError when OPENAI_API_KEY missing", () => {
    const old = process.env.OPENAI_API_KEY;
    // biome-ignore lint/performance/noDelete: env vars must be deleted, not set to undefined
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => new OpenAIProvider()).toThrow(ProviderConfigError);
    } finally {
      restoreEnv("OPENAI_API_KEY", old);
    }
  });

  it("constructs when OPENAI_API_KEY present", () => {
    const old = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    try {
      const p = new OpenAIProvider();
      expect(p).toBeInstanceOf(OpenAIProvider);
      expect(p.metadata.provider).toBe("openai");
    } finally {
      if (old) process.env.OPENAI_API_KEY = old;
      // biome-ignore lint/performance/noDelete: env vars must be deleted, not set to undefined
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("generateObject parses structured output via mocked client", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fakeClient = {
      beta: {
        chat: {
          completions: {
            parse: async () => ({
              choices: [
                {
                  message: {
                    parsed: {
                      candidateFiles: ["a.ts"],
                      confidence: 0.9,
                      reasoningSummary: "x",
                      warnings: [],
                    },
                  },
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
              model: "gpt-4o-mini",
            }),
          },
        },
      },
    };
    const provider = new OpenAIProvider({ client: fakeClient as never });
    const z = await import("zod");
    const result = await provider.generateObject({
      prompt: { system: "s", user: "u", version: "v1" },
      schema: z.object({ candidateFiles: z.array(z.string()) }),
      schemaName: "Test",
    });
    expect(result.object).toMatchObject({ candidateFiles: ["a.ts"] });
    expect(result.metadata.provider).toBe("openai");
    expect(result.metadata.model).toBe("gpt-4o-mini");
    expect(result.metadata.retries).toBe(0);
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
    expect(result.usage.totalTokens).toBe(15);
  });

  it("uses OPENAI_API_KEY, OPENAI_BASE_URL, and OPENAI_MODEL when configured", async () => {
    const oldOpenAIKey = process.env.OPENAI_API_KEY;
    const oldBaseUrl = process.env.OPENAI_BASE_URL;
    const oldModel = process.env.OPENAI_MODEL;
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_BASE_URL = "https://example.test/v1";
    process.env.OPENAI_MODEL = "gpt-test";
    try {
      expect(resolveOpenAIProviderConfig()).toEqual({
        apiKey: "sk-test",
        apiKeySource: "OPENAI_API_KEY",
        baseURL: "https://example.test/v1",
        model: "gpt-test",
      });
    } finally {
      restoreEnv("OPENAI_API_KEY", oldOpenAIKey);
      restoreEnv("OPENAI_BASE_URL", oldBaseUrl);
      restoreEnv("OPENAI_MODEL", oldModel);
    }
  });

  it("prefers explicit options over environment config", () => {
    const old = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    try {
      expect(
        resolveOpenAIProviderConfig({
          apiKey: "explicit-key",
          baseURL: "https://explicit.test/v1",
          model: "explicit-model",
        }),
      ).toEqual({
        apiKey: "explicit-key",
        apiKeySource: "options.apiKey",
        baseURL: "https://explicit.test/v1",
        model: "explicit-model",
      });
    } finally {
      restoreEnv("OPENAI_API_KEY", old);
    }
  });
});

describe("createDeterministicMockProvider", () => {
  it("selects static-signal files and returns semantic evidence refs from real prompt snippets", async () => {
    const provider = createDeterministicMockProvider();
    const z = await import("zod");

    const selection = await provider.generateObject({
      prompt: {
        system: "s",
        user: JSON.stringify({
          staticSignals: [{ filePath: "src/LoginForm.tsx", strength: "strong" }],
          structureSummary: "src/LoginForm.tsx (10 lines)\nsrc/Other.tsx (2 lines)",
        }),
        version: "v1",
      },
      schema: z.object({
        candidateFiles: z.array(z.string()),
        confidence: z.number(),
        reasoningSummary: z.string(),
        warnings: z.array(z.string()),
      }),
      schemaName: "FileSelectionModelOutput",
    });
    expect(selection.object).toMatchObject({
      candidateFiles: ["src/LoginForm.tsx", "src/Other.tsx"],
    });

    const judgement = await provider.generateObject({
      prompt: {
        system: "s",
        user: JSON.stringify({
          evidenceSnippets: [
            {
              filePath: "src/LoginForm.tsx",
              lineStart: 1,
              lineEnd: 10,
              summary: "login snippet",
              text: "localStorage.setItem('session', token)",
            },
          ],
          requirement: { id: "REQ-1", text: "Implement login" },
        }),
        version: "v1",
      },
      schema: z.object({
        confidence: z.number(),
        evidenceRefs: z
          .array(
            z.object({
              filePath: z.string(),
              lineStart: z.number(),
              lineEnd: z.number(),
              snippetSummary: z.string(),
            }),
          )
          .min(1),
        explanation: z.string(),
        judgementDraft: z.enum(["fulfilled", "partial", "unsupported", "suspicious"]),
        matchedRequirementId: z.string().optional(),
        repairSuggestion: z.string(),
      }),
      schemaName: "SemanticJudgementDraft",
    });

    expect(judgement.object).toMatchObject({
      evidenceRefs: [
        {
          filePath: "src/LoginForm.tsx",
          lineStart: 1,
          lineEnd: 10,
        },
      ],
      matchedRequirementId: "REQ-1",
    });
  });
});

describe("createProvider factory", () => {
  it("returns OpenAIProvider when OPENAI_API_KEY set", () => {
    const old = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    try {
      const p = createProvider();
      expect(p).toBeInstanceOf(OpenAIProvider);
      expect(p.metadata.provider).toBe("openai");
    } finally {
      if (old) process.env.OPENAI_API_KEY = old;
      // biome-ignore lint/performance/noDelete: env vars must be deleted, not set to undefined
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("returns deterministic mock when no key + warns stderr", () => {
    const old = process.env.OPENAI_API_KEY;
    // biome-ignore lint/performance/noDelete: env vars must be deleted, not set to undefined
    delete process.env.OPENAI_API_KEY;
    const warns: string[] = [];
    try {
      const p = createProvider({ stderr: (s: string) => warns.push(s) });
      expect(p.metadata.provider).toBe("deterministic-mock");
      expect(warns.some((w) => w.includes("OPENAI_API_KEY"))).toBe(true);
    } finally {
      if (old) process.env.OPENAI_API_KEY = old;
    }
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
