import { describe, expect, it } from "vitest";
import type { LLMProvider } from "./provider.js";
import {
  decomposeRequirements,
  stabilizeRequirementDecomposition,
} from "./requirement-decomposition.js";

describe("decomposeRequirements", () => {
  it("requests structured requirement decomposition from the provider", async () => {
    const schemaNames: string[] = [];
    const provider: LLMProvider = {
      async generateObject({ prompt, schema, schemaName }) {
        schemaNames.push(schemaName);
        expect(prompt.version).toBe("requirement-decomposition-v5");
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

  it("preserves explicit requirement granularity when provider over-splits compound numbered items", async () => {
    const requirement = [
      "REQ-1: Create an auth session, persist it in localStorage, and show the signed-in user.",
      "REQ-2: Add todos, persist them, and restore them after reload.",
      "REQ-3: Export todos as CSV and show a download confirmation.",
      "REQ-4: Display validation errors and keep form input intact.",
      "REQ-5: Keep the UI responsive and accessible during loading.",
    ].join("\n");

    const result = stabilizeRequirementDecomposition({
      claim: "",
      requirement,
      output: {
        claims: [],
        confidence: 0.7,
        requirements: [
          { id: "REQ-1", text: "Create an auth session." },
          { id: "REQ-1a", text: "Persist auth session in localStorage." },
          { id: "REQ-1b", text: "Show the signed-in user." },
          { id: "REQ-2", text: "Add todos." },
          { id: "REQ-2-1", text: "Persist todos." },
          { id: "REQ-2-2", text: "Restore todos after reload." },
          { id: "REQ-3", text: "Export todos as CSV." },
          { id: "REQ-3a", text: "Show a download confirmation." },
          { id: "REQ-4", text: "Display validation errors." },
          { id: "REQ-4a", text: "Keep form input intact." },
          { id: "REQ-5", text: "Keep the UI responsive." },
          { id: "REQ-5a", text: "Keep the UI accessible during loading." },
        ],
        warnings: [],
      },
    });

    expect(result.requirements).toEqual([
      {
        id: "REQ-1",
        text: "Create an auth session, persist it in localStorage, and show the signed-in user.",
      },
      { id: "REQ-2", text: "Add todos, persist them, and restore them after reload." },
      { id: "REQ-3", text: "Export todos as CSV and show a download confirmation." },
      { id: "REQ-4", text: "Display validation errors and keep form input intact." },
      { id: "REQ-5", text: "Keep the UI responsive and accessible during loading." },
    ]);
    expect(result.warnings.some((warning) => warning.includes("REQ-1"))).toBe(true);
  });

  it("preserves explicit claim granularity when provider over-splits and/also clauses", () => {
    const claim = [
      "CLAIM-1: Auth session is created and persisted.",
      "CLAIM-2: Todos can be added and restored.",
      "CLAIM-3: CSV export exists and shows a confirmation.",
      "CLAIM-4: Validation errors display and input remains intact.",
      "CLAIM-5: Loading UI is responsive and accessible.",
      "CLAIM-6: Documentation was updated and examples were refreshed.",
    ].join("\n");

    const result = stabilizeRequirementDecomposition({
      claim,
      requirement: "REQ-1: Implement the app.",
      output: {
        claims: [
          { id: "CLAIM-1", text: "Auth session is created." },
          { id: "CLAIM-1a", text: "Auth session is persisted." },
          { id: "CLAIM-2", text: "Todos can be added." },
          { id: "CLAIM-2a", text: "Todos can be restored." },
          { id: "CLAIM-3", text: "CSV export exists." },
          { id: "CLAIM-3a", text: "CSV export shows a confirmation." },
          { id: "CLAIM-4", text: "Validation errors display." },
          { id: "CLAIM-4a", text: "Input remains intact." },
          { id: "CLAIM-5", text: "Loading UI is responsive." },
          { id: "CLAIM-5a", text: "Loading UI is accessible." },
          { id: "CLAIM-6", text: "Documentation was updated." },
          { id: "CLAIM-6a", text: "Examples were refreshed." },
        ],
        confidence: 0.7,
        requirements: [{ id: "REQ-1", text: "Implement the app." }],
      },
    });

    expect(result.claims.map((item) => item.id)).toEqual([
      "CLAIM-1",
      "CLAIM-2",
      "CLAIM-3",
      "CLAIM-4",
      "CLAIM-5",
      "CLAIM-6",
    ]);
    expect(result.claims[0]?.text).toBe("Auth session is created and persisted.");
  });

  it("allows explicitly numbered bullet sub-items to remain split when independently verifiable", () => {
    const requirement = [
      "REQ-1: Add account settings:",
      "- REQ-1a: Let users change their display name.",
      "- REQ-1b: Let users rotate their API token.",
    ].join("\n");

    const result = stabilizeRequirementDecomposition({
      requirement,
      output: {
        claims: [],
        confidence: 0.8,
        requirements: [
          { id: "REQ-1a", text: "Let users change their display name." },
          { id: "REQ-1b", text: "Let users rotate their API token." },
        ],
        warnings: [
          "REQ-1 was split because it contains explicit independently verifiable bullet sub-items.",
        ],
      },
    });

    expect(result.requirements.map((item) => item.id)).toEqual(["REQ-1a", "REQ-1b"]);
    expect(result.warnings).toContain(
      "REQ-1 was split because it contains explicit independently verifiable bullet sub-items.",
    );
  });

  it("deduplicates and merges overlapping split items back to the original explicit id", () => {
    const result = stabilizeRequirementDecomposition({
      requirement: "REQ-2: Add export, download the CSV, and show a confirmation.",
      output: {
        claims: [],
        requirements: [
          { id: "REQ-2", text: "Add export." },
          { id: "REQ-2", text: "Add export." },
          { id: "REQ-2a", text: "Download the CSV." },
          { id: "REQ-2-1", text: "Show a confirmation." },
        ],
      },
    });

    expect(result.requirements).toEqual([
      { id: "REQ-2", text: "Add export, download the CSV, and show a confirmation." },
    ]);
  });

  it("keeps unnumbered fallback decomposition intact", () => {
    const result = stabilizeRequirementDecomposition({
      requirement: "Build login, todo persistence, and CSV export.",
      claim: "Login works and export works.",
      output: {
        claims: [
          { id: "CLAIM-1", text: "Login works." },
          { id: "CLAIM-2", text: "Export works." },
        ],
        requirements: [
          { id: "REQ-1", text: "Build login." },
          { id: "REQ-2", text: "Build todo persistence." },
          { id: "REQ-3", text: "Build CSV export." },
        ],
      },
    });

    expect(result.requirements.map((item) => item.text)).toEqual([
      "Build login.",
      "Build todo persistence.",
      "Build CSV export.",
    ]);
    expect(result.claims.map((item) => item.text)).toEqual(["Login works.", "Export works."]);
  });

  it("removes internal item identifiers from user-facing review notes", () => {
    const result = stabilizeRequirementDecomposition({
      requirement: "Build login and logout.",
      output: {
        assumptions: ["REQ-1: The app already has a user store."],
        claims: [],
        clarifyingQuestions: ["CLAIM-2: Should logout clear all sessions?"],
        requirements: [{ id: "REQ-1", text: "Build login and logout." }],
        warnings: ["REQ-1 has no matching CLAIM-2."],
      },
    });

    expect(result.assumptions).toEqual(["The app already has a user store."]);
    expect(result.clarifyingQuestions).toEqual(["Should logout clear all sessions?"]);
    expect(result.assumptions.join(" ")).not.toMatch(/(?:REQ|CLAIM)-[A-Z0-9_-]+/iu);
    expect(result.clarifyingQuestions.join(" ")).not.toMatch(/(?:REQ|CLAIM)-[A-Z0-9_-]+/iu);
  });
});
