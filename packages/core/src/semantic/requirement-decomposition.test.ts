import { describe, expect, it } from "vitest";
import type { LLMProvider } from "./provider.js";
import { decomposeRequirements } from "./requirement-decomposition.js";

describe("decomposeRequirements", () => {
  it("requests structured requirement decomposition from the provider", async () => {
    const schemaNames: string[] = [];
    const provider: LLMProvider = {
      async generateObject({ prompt, schema, schemaName }) {
        schemaNames.push(schemaName);
        expect(prompt.version).toBe("requirement-decomposition-v1");
        const payload = JSON.parse(prompt.user) as Record<string, unknown>;
        expect(payload.requirement).toContain("REQ-1");
        return {
          metadata: { model: "mock", provider: "mock", retries: 0 },
          object: schema.parse({
            claims: [
              { id: "CLAIM-1", text: "Login is implemented." },
              { id: "CLAIM-2", text: "Todos are implemented." },
            ],
            confidence: 0.9,
            requirements: [
              { id: "REQ-1", text: "Implement login." },
              { id: "REQ-2", text: "Implement todos." },
            ],
          }),
          usage: {},
        };
      },
    };

    const result = await decomposeRequirements({
      requirement: "REQ-1: Implement login.\nREQ-2: Implement todos.",
      claim: "CLAIM-1: Login is implemented.\nCLAIM-2: Todos are implemented.",
      provider,
    });

    expect(schemaNames).toEqual(["RequirementDecompositionOutput"]);
    expect(result.requirements.map((item) => item.id)).toEqual(["REQ-1", "REQ-2"]);
    expect(result.claims.map((item) => item.id)).toEqual(["CLAIM-1", "CLAIM-2"]);
    expect(result.assumptions).toEqual([]);
    expect(result.clarifyingQuestions).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("deduplicates requirements and claims by id when the provider returns duplicates", async () => {
    const provider: LLMProvider = {
      async generateObject({ schema, schemaName }) {
        expect(schemaName).toBe("RequirementDecompositionOutput");
        return {
          metadata: { model: "mock", provider: "mock", retries: 0 },
          object: schema.parse({
            claims: [
              { id: "CLAIM-1", text: "Login is implemented." },
              { id: "CLAIM-1", text: "Login is implemented." },
              { id: "CLAIM-2", text: "Todos are implemented." },
            ],
            confidence: 0.9,
            requirements: [
              { id: "REQ-1", text: "Implement login." },
              { id: "REQ-1", text: "Implement login." },
              { id: "REQ-2", text: "Implement todos." },
              { id: "REQ-2", text: "Implement todos." },
            ],
          }),
          usage: {},
        };
      },
    };

    const result = await decomposeRequirements({
      requirement: "REQ-1: Implement login.\nREQ-2: Implement todos.",
      claim: "CLAIM-1: Login is implemented.\nCLAIM-2: Todos are implemented.",
      provider,
    });

    expect(result.requirements.map((item) => item.id)).toEqual(["REQ-1", "REQ-2"]);
    expect(result.claims.map((item) => item.id)).toEqual(["CLAIM-1", "CLAIM-2"]);
  });
});
