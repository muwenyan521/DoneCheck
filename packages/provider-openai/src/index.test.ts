import { describe, expect, it } from "vitest";
import { OpenAIProvider, ProviderConfigError, createProvider } from "./index.js";

describe("OpenAIProvider", () => {
  it("throws ProviderConfigError when OPENAI_API_KEY missing", () => {
    const old = process.env.OPENAI_API_KEY;
    // biome-ignore lint/performance/noDelete: env vars must be deleted, not set to undefined
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => new OpenAIProvider()).toThrow(ProviderConfigError);
    } finally {
      if (old) process.env.OPENAI_API_KEY = old;
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
