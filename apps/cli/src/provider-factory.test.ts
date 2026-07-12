import { describe, expect, it, vi } from "vitest";
import { createProvider } from "./provider-factory.js";

vi.mock("@donecheck/provider-openai", () => ({
  createProvider: (options: { stderr?: (chunk: string) => void } = {}) => {
    if (process.env.OPENAI_API_KEY !== undefined && process.env.OPENAI_API_KEY.length > 0) {
      return { metadata: { model: "test", provider: "openai", retries: 0 } };
    }
    options.stderr?.("OPENAI_API_KEY is not set.\n");
    throw new Error("OPENAI_API_KEY is not set.");
  },
  createDeterministicMockProvider: () => ({
    metadata: { model: "mock", provider: "deterministic-mock", retries: 0 },
  }),
}));

describe("createProvider", () => {
  it("returns OpenAIProvider when OPENAI_API_KEY set", () => {
    const old = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    try {
      const p = createProvider();
      expect(p.metadata.provider).toBe("openai");
    } finally {
      if (old === undefined) {
        // biome-ignore lint/performance/noDelete: env var cleanup requires delete
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = old;
      }
    }
  });

  it("throws when no key and no mock flag", () => {
    const old = process.env.OPENAI_API_KEY;
    // biome-ignore lint/performance/noDelete: env var cleanup requires delete
    delete process.env.OPENAI_API_KEY;
    const warns: string[] = [];
    try {
      expect(() => createProvider({ stderr: (s) => warns.push(s) })).toThrow("OPENAI_API_KEY");
      expect(warns.join("\n")).toContain("OPENAI_API_KEY");
    } finally {
      if (old !== undefined) {
        process.env.OPENAI_API_KEY = old;
      }
    }
  });

  it("returns local demo provider when mock flag is true", () => {
    const old = process.env.OPENAI_API_KEY;
    // biome-ignore lint/performance/noDelete: env var cleanup requires delete
    delete process.env.OPENAI_API_KEY;
    const warns: string[] = [];
    try {
      const p = createProvider({ mock: true, stderr: (s) => warns.push(s) });
      expect(p.metadata.provider).toBe("deterministic-mock");
      expect(warns.join("\n")).toContain("local demo mode");
      expect(warns.join("\n")).not.toContain("deterministic mock");
    } finally {
      if (old !== undefined) {
        process.env.OPENAI_API_KEY = old;
      }
    }
  });

  it("returns local demo provider when mock flag is true even with API key set", () => {
    const old = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test";
    try {
      const p = createProvider({ mock: true });
      expect(p.metadata.provider).toBe("deterministic-mock");
    } finally {
      if (old === undefined) {
        // biome-ignore lint/performance/noDelete: env var cleanup requires delete
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = old;
      }
    }
  });
});
