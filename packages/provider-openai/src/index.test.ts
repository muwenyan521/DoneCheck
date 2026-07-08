import { describe, expect, it, vi } from "vitest";
import {
  OpenAIProvider,
  ProviderConfigError,
  createDeterministicMockProvider,
  createProvider,
  resolveOpenAIProviderConfig,
} from "./index.js";

function fallbackClient(contents: readonly string[], calls: unknown[]) {
  let index = 0;
  return {
    beta: {
      chat: {
        completions: {
          parse: async () => {
            throw new Error("400 This response_format type is unavailable now");
          },
        },
      },
    },
    chat: {
      completions: {
        create: async (args: unknown) => {
          calls.push(args);
          const content = contents[Math.min(index, contents.length - 1)] ?? "{}";
          index += 1;
          return {
            choices: [{ message: { content } }],
            usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
            model: "compatible-model",
          };
        },
      },
    },
  };
}

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

  it("sends strict structured output by default", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    let parseArgs: unknown;
    const fakeClient = {
      beta: {
        chat: {
          completions: {
            parse: async (args: unknown) => {
              parseArgs = args;
              return {
                choices: [{ message: { parsed: { ok: true } } }],
                model: "gpt-4o-mini",
              };
            },
          },
        },
      },
    };
    const provider = new OpenAIProvider({ client: fakeClient as never });
    const z = await import("zod");

    await provider.generateObject({
      prompt: { system: "s", user: "u", version: "v1" },
      schema: z.object({ ok: z.boolean() }),
      schemaName: "Ok",
    });

    expect(parseArgs).toMatchObject({
      response_format: { json_schema: { strict: true } },
    });
  });

  it("sets response_format.json_schema.strict false from OPENAI_STRUCTURED_OUTPUT_STRICT=false", async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    const oldStrict = process.env.OPENAI_STRUCTURED_OUTPUT_STRICT;
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_STRUCTURED_OUTPUT_STRICT = "false";
    let parseArgs: unknown;
    try {
      const fakeClient = {
        beta: {
          chat: {
            completions: {
              parse: async (args: unknown) => {
                parseArgs = args;
                return {
                  choices: [{ message: { parsed: { ok: true } } }],
                  model: "gpt-4o-mini",
                };
              },
            },
          },
        },
      };
      const provider = new OpenAIProvider({ client: fakeClient as never });
      const z = await import("zod");

      await provider.generateObject({
        prompt: { system: "s", user: "u", version: "v1" },
        schema: z.object({ ok: z.boolean() }),
        schemaName: "Ok",
      });

      expect(parseArgs).toMatchObject({
        response_format: { json_schema: { strict: false } },
      });
    } finally {
      restoreEnv("OPENAI_API_KEY", oldKey);
      restoreEnv("OPENAI_STRUCTURED_OUTPUT_STRICT", oldStrict);
    }
  });

  it("sets response_format.json_schema.strict true from OPENAI_STRUCTURED_OUTPUT_STRICT=true", async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    const oldStrict = process.env.OPENAI_STRUCTURED_OUTPUT_STRICT;
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_STRUCTURED_OUTPUT_STRICT = "true";
    let parseArgs: unknown;
    try {
      const fakeClient = {
        beta: {
          chat: {
            completions: {
              parse: async (args: unknown) => {
                parseArgs = args;
                return {
                  choices: [{ message: { parsed: { ok: true } } }],
                  model: "gpt-4o-mini",
                };
              },
            },
          },
        },
      };
      const provider = new OpenAIProvider({ client: fakeClient as never });
      const z = await import("zod");

      await provider.generateObject({
        prompt: { system: "s", user: "u", version: "v1" },
        schema: z.object({ ok: z.boolean() }),
        schemaName: "Ok",
      });

      expect(parseArgs).toMatchObject({
        response_format: { json_schema: { strict: true } },
      });
    } finally {
      restoreEnv("OPENAI_API_KEY", oldKey);
      restoreEnv("OPENAI_STRUCTURED_OUTPUT_STRICT", oldStrict);
    }
  });

  it("prefers explicit structuredOutputStrict over environment config", async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    const oldStrict = process.env.OPENAI_STRUCTURED_OUTPUT_STRICT;
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_STRUCTURED_OUTPUT_STRICT = "true";
    let parseArgs: unknown;
    try {
      const fakeClient = {
        beta: {
          chat: {
            completions: {
              parse: async (args: unknown) => {
                parseArgs = args;
                return {
                  choices: [{ message: { parsed: { ok: true } } }],
                  model: "gpt-4o-mini",
                };
              },
            },
          },
        },
      };
      const provider = new OpenAIProvider({
        client: fakeClient as never,
        structuredOutputStrict: false,
      });
      const z = await import("zod");

      await provider.generateObject({
        prompt: { system: "s", user: "u", version: "v1" },
        schema: z.object({ ok: z.boolean() }),
        schemaName: "Ok",
      });

      expect(parseArgs).toMatchObject({
        response_format: { json_schema: { strict: false } },
      });
    } finally {
      restoreEnv("OPENAI_API_KEY", oldKey);
      restoreEnv("OPENAI_STRUCTURED_OUTPUT_STRICT", oldStrict);
    }
  });

  it("validates parsed structured output with the local Zod schema when strict is false", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fakeClient = {
      beta: {
        chat: {
          completions: {
            parse: async () => ({
              choices: [{ message: { parsed: { ok: true } } }],
              model: "gpt-4o-mini",
            }),
          },
        },
      },
    };
    const provider = new OpenAIProvider({
      client: fakeClient as never,
      structuredOutputStrict: false,
    });
    const z = await import("zod");
    const schema = z.object({ ok: z.boolean() });
    const parse = vi.spyOn(schema, "parse");

    const result = await provider.generateObject({
      prompt: { system: "s", user: "u", version: "v1" },
      schema,
      schemaName: "Ok",
    });

    expect(parse).toHaveBeenCalledWith({ ok: true });
    expect(result.object).toEqual({ ok: true });
  });

  it("rejects invalid OPENAI_STRUCTURED_OUTPUT_STRICT values", () => {
    const oldKey = process.env.OPENAI_API_KEY;
    const oldStrict = process.env.OPENAI_STRUCTURED_OUTPUT_STRICT;
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.OPENAI_STRUCTURED_OUTPUT_STRICT = "maybe";
    try {
      expect(() => resolveOpenAIProviderConfig()).toThrow(ProviderConfigError);
      expect(() => resolveOpenAIProviderConfig()).toThrow("OPENAI_STRUCTURED_OUTPUT_STRICT");
    } finally {
      restoreEnv("OPENAI_API_KEY", oldKey);
      restoreEnv("OPENAI_STRUCTURED_OUTPUT_STRICT", oldStrict);
    }
  });

  it("falls back with schema-aware JSON instruction", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    let createArgs: unknown;
    const fakeClient = {
      beta: {
        chat: {
          completions: {
            parse: async () => {
              throw new Error("400 This response_format type is unavailable now");
            },
          },
        },
      },
      chat: {
        completions: {
          create: async (args: unknown) => {
            createArgs = args;
            return {
              choices: [{ message: { content: '{"candidateFiles":["a.ts"]}' } }],
              usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
              model: "compatible-model",
            };
          },
        },
      },
    };
    const provider = new OpenAIProvider({
      client: fakeClient as never,
      model: "compatible-model",
    });
    const z = await import("zod");
    const result = await provider.generateObject({
      prompt: { system: "s", user: "u", version: "v1" },
      schema: z.object({ candidateFiles: z.array(z.string()) }),
      schemaName: "Test",
    });

    expect(result.object).toEqual({ candidateFiles: ["a.ts"] });
    expect(result.metadata.model).toBe("compatible-model");
    expect(result.usage.totalTokens).toBe(7);
    expect(createArgs).toMatchObject({
      model: "compatible-model",
      stream: false,
    });
    expect(JSON.stringify(createArgs)).not.toContain("reasoning_effort");
    expect(JSON.stringify(createArgs)).not.toContain("thinking");
    expect(JSON.stringify(createArgs)).toContain("Return only one valid JSON object");
    expect(JSON.stringify(createArgs)).toContain("Test");
    expect(JSON.stringify(createArgs)).toContain("candidateFiles");
    expect(JSON.stringify(createArgs)).toContain("evidenceRefs");
    expect(JSON.stringify(createArgs)).toContain("exact filePath, lineStart, and lineEnd");
  });

  it("repairs fallback JSON when required field is missing", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const createArgs: unknown[] = [];
    const fakeClient = fallbackClient(
      [
        '{"confidence":0.8,"evidenceRefs":[],"explanation":"x","judgementDraft":"partial"}',
        '{"confidence":0.8,"evidenceRefs":[],"explanation":"x","judgementDraft":"partial","repairSuggestion":"Implement the missing behavior."}',
      ],
      createArgs,
    );
    const provider = new OpenAIProvider({
      client: fakeClient as never,
      model: "compatible-model",
    });
    const z = await import("zod");
    const result = await provider.generateObject({
      prompt: { system: "s", user: "u", version: "v1" },
      schema: z.object({
        confidence: z.number(),
        evidenceRefs: z.array(z.unknown()),
        explanation: z.string(),
        judgementDraft: z.string(),
        repairSuggestion: z.string(),
      }),
      schemaName: "SemanticJudgementDraft",
    });

    expect(result.object).toMatchObject({ repairSuggestion: "Implement the missing behavior." });
    expect(createArgs).toHaveLength(2);
    expect(JSON.stringify(createArgs[1])).toContain("repairSuggestion");
  });

  it("does not locally fill missing required fields", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const createArgs: unknown[] = [];
    const fakeClient = fallbackClient(
      [
        '{"confidence":0.8,"evidenceRefs":[],"explanation":"x","judgementDraft":"partial"}',
        '{"confidence":0.8,"evidenceRefs":[],"explanation":"x","judgementDraft":"partial"}',
      ],
      createArgs,
    );
    const provider = new OpenAIProvider({
      client: fakeClient as never,
      model: "compatible-model",
    });
    const z = await import("zod");

    await expect(
      provider.generateObject({
        prompt: { system: "s", user: "u", version: "v1" },
        schema: z.object({
          confidence: z.number(),
          evidenceRefs: z.array(z.unknown()),
          explanation: z.string(),
          judgementDraft: z.string(),
          repairSuggestion: z.string(),
        }),
        schemaName: "SemanticJudgementDraft",
      }),
    ).rejects.toThrow("repairSuggestion");
    expect(createArgs).toHaveLength(2);
  });

  it("adds reasoning_effort and thinking when OPENAI_REASONING_EFFORT is set", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const oldReasoning = process.env.OPENAI_REASONING_EFFORT;
    process.env.OPENAI_REASONING_EFFORT = "high";
    const createArgs: unknown[] = [];
    try {
      const provider = new OpenAIProvider({
        client: fallbackClient(['{"ok":true}'], createArgs) as never,
        model: "compatible-model",
      });
      const z = await import("zod");
      await provider.generateObject({
        prompt: { system: "s", user: "u", version: "v1" },
        schema: z.object({ ok: z.boolean() }),
        schemaName: "Ok",
      });

      expect(createArgs[0]).toMatchObject({
        reasoning_effort: "high",
        thinking: { type: "enabled" },
      });
    } finally {
      restoreEnv("OPENAI_REASONING_EFFORT", oldReasoning);
    }
  });

  it("does not add reasoning_effort when OPENAI_REASONING_EFFORT is unset", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const oldReasoning = process.env.OPENAI_REASONING_EFFORT;
    // biome-ignore lint/performance/noDelete: env vars must be deleted, not set to undefined
    delete process.env.OPENAI_REASONING_EFFORT;
    const createArgs: unknown[] = [];
    try {
      const provider = new OpenAIProvider({
        client: fallbackClient(['{"ok":true}'], createArgs) as never,
        model: "compatible-model",
      });
      const z = await import("zod");
      await provider.generateObject({
        prompt: { system: "s", user: "u", version: "v1" },
        schema: z.object({ ok: z.boolean() }),
        schemaName: "Ok",
      });

      expect(JSON.stringify(createArgs[0])).not.toContain("reasoning_effort");
      expect(JSON.stringify(createArgs[0])).not.toContain("thinking");
    } finally {
      restoreEnv("OPENAI_REASONING_EFFORT", oldReasoning);
    }
  });

  it("ignores invalid OPENAI_REASONING_EFFORT values", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const oldReasoning = process.env.OPENAI_REASONING_EFFORT;
    process.env.OPENAI_REASONING_EFFORT = "extreme";
    const createArgs: unknown[] = [];
    try {
      const provider = new OpenAIProvider({
        client: fallbackClient(['{"ok":true}'], createArgs) as never,
        model: "compatible-model",
      });
      const z = await import("zod");
      await provider.generateObject({
        prompt: { system: "s", user: "u", version: "v1" },
        schema: z.object({ ok: z.boolean() }),
        schemaName: "Ok",
      });

      expect(JSON.stringify(createArgs[0])).not.toContain("reasoning_effort");
      expect(JSON.stringify(createArgs[0])).not.toContain("thinking");
    } finally {
      restoreEnv("OPENAI_REASONING_EFFORT", oldReasoning);
    }
  });

  it("does not fallback for 401, 429, 502, or 504", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const z = await import("zod");
    for (const message of [
      "401 invalid API key",
      "429 Too Many Requests",
      "502 Upstream request failed",
      "504 Gateway Timeout",
    ]) {
      let createCalls = 0;
      const provider = new OpenAIProvider({
        client: {
          beta: {
            chat: {
              completions: {
                parse: async () => {
                  throw new Error(message);
                },
              },
            },
          },
          chat: {
            completions: {
              create: async () => {
                createCalls += 1;
                return {};
              },
            },
          },
        } as never,
      });
      await expect(
        provider.generateObject({
          prompt: { system: "s", user: "u", version: "v1" },
          schema: z.object({ ok: z.boolean() }),
          schemaName: "Ok",
        }),
      ).rejects.toThrow(message);
      expect(createCalls).toBe(0);
    }
  });

  it("falls back when parse throws JSON parse error from reasoning model <think> tags", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    let createCalls = 0;
    const fakeClient = {
      beta: {
        chat: {
          completions: {
            parse: async () => {
              throw new SyntaxError("Unexpected token '<', '<think>The'... is not valid JSON");
            },
          },
        },
      },
      chat: {
        completions: {
          create: async () => {
            createCalls += 1;
            return {
              choices: [{ message: { content: '{"ok":true}' } }],
              usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
              model: "compatible-model",
            };
          },
        },
      },
    };
    const provider = new OpenAIProvider({ client: fakeClient as never });
    const z = await import("zod");
    const result = await provider.generateObject({
      prompt: { system: "s", user: "u", version: "v1" },
      schema: z.object({ ok: z.boolean() }),
      schemaName: "Ok",
    });
    expect(result.object).toEqual({ ok: true });
    expect(createCalls).toBe(1);
  });

  it("strips <think> tags from fallback content before parsing", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const fakeClient = {
      beta: {
        chat: {
          completions: {
            parse: async () => {
              throw new Error("400 This response_format type is unavailable now");
            },
          },
        },
      },
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content:
                    '<think>The schema needs {ok: boolean} so I will return that.</think>\n\n{"ok":true}',
                },
              },
            ],
            usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
            model: "compatible-model",
          }),
        },
      },
    };
    const provider = new OpenAIProvider({ client: fakeClient as never });
    const z = await import("zod");
    const result = await provider.generateObject({
      prompt: { system: "s", user: "u", version: "v1" },
      schema: z.object({ ok: z.boolean() }),
      schemaName: "Ok",
    });
    expect(result.object).toEqual({ ok: true });
  });

  it("uses OPENAI_API_KEY, OPENAI_BASE_URL, and OPENAI_MODEL when configured", () => {
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
        structuredOutputStrict: true,
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
        structuredOutputStrict: true,
      });
    } finally {
      restoreEnv("OPENAI_API_KEY", old);
    }
  });
});

describe("createDeterministicMockProvider", () => {
  it("decomposes marked requirements and claims with continuation lines", async () => {
    const provider = createDeterministicMockProvider();
    const z = await import("zod");

    const result = await provider.generateObject({
      prompt: {
        system: "s",
        user: JSON.stringify({
          requirement:
            "REQ-1: Implement login.\nContinue login details.\nREQ-2: Implement todo list.",
          claim: "CLAIM-1: Login is done.\nCLAIM-2: Todo list is partly done.",
        }),
        version: "requirement-decomposition-v1",
      },
      schema: z.object({
        assumptions: z.array(z.string()).default([]),
        clarifyingQuestions: z.array(z.string()).default([]),
        claims: z.array(z.object({ id: z.string(), text: z.string() })),
        confidence: z.number().optional(),
        requirements: z.array(z.object({ id: z.string(), text: z.string() })),
        warnings: z.array(z.string()).default([]),
      }),
      schemaName: "RequirementDecompositionOutput",
    });

    expect(result.object.requirements).toEqual([
      { id: "REQ-1", text: "Implement login. Continue login details." },
      { id: "REQ-2", text: "Implement todo list." },
    ]);
    expect(result.object.claims).toEqual([
      { id: "CLAIM-1", text: "Login is done." },
      { id: "CLAIM-2", text: "Todo list is partly done." },
    ]);
  });

  it("falls back to one requirement and one claim when markers are absent", async () => {
    const provider = createDeterministicMockProvider();
    const z = await import("zod");

    const result = await provider.generateObject({
      prompt: {
        system: "s",
        user: JSON.stringify({ requirement: "Build a todo app.", claim: "I built it." }),
        version: "requirement-decomposition-v1",
      },
      schema: z.object({
        assumptions: z.array(z.string()).default([]),
        clarifyingQuestions: z.array(z.string()).default([]),
        claims: z.array(z.object({ id: z.string(), text: z.string() })),
        requirements: z.array(z.object({ id: z.string(), text: z.string() })),
        warnings: z.array(z.string()).default([]),
      }),
      schemaName: "RequirementDecompositionOutput",
    });

    expect(result.object.requirements).toEqual([{ id: "REQ-1", text: "Build a todo app." }]);
    expect(result.object.claims).toEqual([{ id: "CLAIM-1", text: "I built it." }]);
  });

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

  it("returns deterministic mock when no key + warns stderr mentioning OPENAI_API_KEY", () => {
    const old = process.env.OPENAI_API_KEY;
    // biome-ignore lint/performance/noDelete: env vars must be deleted, not set to undefined
    delete process.env.OPENAI_API_KEY;
    const warns: string[] = [];
    try {
      const p = createProvider({ stderr: (s: string) => warns.push(s) });
      expect(p.metadata.provider).toBe("deterministic-mock");
      expect(warns.some((w) => w.includes("OPENAI_API_KEY"))).toBe(true);
    } finally {
      restoreEnv("OPENAI_API_KEY", old);
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
