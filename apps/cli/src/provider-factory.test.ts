import { describe, expect, it } from "vitest";
import { createProvider } from "./provider-factory.js";

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

  it("returns deterministic mock when no key + warns stderr", () => {
    const old = process.env.OPENAI_API_KEY;
    // biome-ignore lint/performance/noDelete: env var cleanup requires delete
    delete process.env.OPENAI_API_KEY;
    const warns: string[] = [];
    try {
      const p = createProvider({ stderr: (s) => warns.push(s) });
      expect(p.metadata.provider).toBe("deterministic-mock");
      expect(warns.some((w) => w.includes("OPENAI_API_KEY"))).toBe(true);
    } finally {
      if (old !== undefined) {
        process.env.OPENAI_API_KEY = old;
      }
    }
  });
});
