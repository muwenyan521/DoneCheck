import { describe, expect, it } from "vitest";
import {
  FILE_SELECTION_PROMPT_VERSION,
  REQUIREMENT_DECOMPOSITION_PROMPT_VERSION,
  buildFileSelectionPrompt,
  buildRequirementDecompositionPrompt,
  fileSelectionModelOutputPromptContract,
  requirementDecompositionPromptContract,
} from "../prompts/index.js";
import {
  SEMANTIC_JUDGEMENT_PROMPT_VERSION,
  buildSemanticJudgementPrompt,
  semanticJudgementDraftPromptContract,
} from "../prompts/index.js";
import { requirementDecompositionOutputSchema } from "./requirement-decomposition-schema.js";
import { fileSelectionModelOutputSchema, semanticJudgementDraftSchema } from "./schema.js";

describe("phase 3 prompts", () => {
  it("builds versioned requirement decomposition prompts with schema-aligned fields", () => {
    const prompt = buildRequirementDecompositionPrompt({
      requirement: "REQ-1: Implement login.\nREQ-2: Implement todos.",
      claim: "CLAIM-1: Login is implemented.\nCLAIM-2: Todos are implemented.",
    });

    expect(REQUIREMENT_DECOMPOSITION_PROMPT_VERSION).toBe("requirement-decomposition-v4");
    expect(prompt.system).toContain(REQUIREMENT_DECOMPOSITION_PROMPT_VERSION);
    expect(prompt.user).toContain("requirements");
    expect(prompt.user).toContain("claims");
    expect(prompt.user).toContain("assumptions");
    expect(prompt.user).toContain("clarifyingQuestions");

    const payload = JSON.parse(prompt.user) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["claim", "outputContract", "requirement"]);
    expect(requirementDecompositionOutputSchema.keyof().options.sort()).toEqual(
      Object.keys(requirementDecompositionPromptContract).sort(),
    );
  });

  it("requirement decomposition prompt forbids object form for string[] fields", () => {
    const prompt = buildRequirementDecompositionPrompt({
      requirement: "REQ-1: Implement login.",
      claim: "CLAIM-1: Login is implemented.",
    });

    expect(prompt.system).toMatch(/Do NOT return objects/i);
    expect(prompt.system).toContain("clarifyingQuestions");
    expect(prompt.system).toContain("assumptions");
    expect(prompt.system).toContain("warnings");
    expect(prompt.system).toMatch(/plain string/i);
  });

  it("requirement decomposition prompt contract marks string[] fields as plain strings", () => {
    expect(requirementDecompositionPromptContract.assumptions).toMatch(/string\[\]/i);
    expect(requirementDecompositionPromptContract.clarifyingQuestions).toMatch(/string\[\]/i);
    expect(requirementDecompositionPromptContract.warnings).toMatch(/string\[\]/i);
  });

  it("requirementDecompositionOutputSchema rejects object[] for clarifyingQuestions, assumptions, and warnings", () => {
    const validBase = {
      requirements: [{ id: "REQ-1", text: "Implement login." }],
      claims: [{ id: "CLAIM-1", text: "Login is implemented." }],
    };

    expect(() =>
      requirementDecompositionOutputSchema.parse({
        ...validBase,
        clarifyingQuestions: [{ id: "REQ-1", question: "Should this persist?" }],
      }),
    ).toThrow();

    expect(() =>
      requirementDecompositionOutputSchema.parse({
        ...validBase,
        assumptions: [{ id: "A-1", text: "Assumes browser storage." }],
      }),
    ).toThrow();

    expect(() =>
      requirementDecompositionOutputSchema.parse({
        ...validBase,
        warnings: [{ id: "W-1", text: "Contradiction found." }],
      }),
    ).toThrow();

    expect(() =>
      requirementDecompositionOutputSchema.parse({
        ...validBase,
        clarifyingQuestions: ["REQ-1: Should this persist after reload?"],
        assumptions: ["Browser localStorage is available."],
        warnings: [],
      }),
    ).not.toThrow();
  });

  it("builds versioned file selection prompts with schema-aligned input fields", () => {
    const prompt = buildFileSelectionPrompt({
      claim: "I implemented auth persistence.",
      requirement: "Persist auth state.",
      staticSignals: [
        { filePath: "src/auth/session.ts", keyword: "localStorage", strength: "strong" },
      ],
      structureSummary: "src/auth/session.ts - auth persistence",
      topK: 5,
    });

    expect(FILE_SELECTION_PROMPT_VERSION).toBe("file-selection-v2");
    expect(prompt.system).toContain(FILE_SELECTION_PROMPT_VERSION);
    expect(prompt.user).toContain("requirement");
    expect(prompt.user).toContain("claim");
    expect(prompt.user).toContain("structureSummary");
    expect(prompt.user).toContain("staticSignals");
    expect(prompt.user).toContain("candidateFiles");
    expect(prompt.user).toContain("warnings");

    const payload = JSON.parse(prompt.user) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "claim",
      "outputContract",
      "requirement",
      "staticSignals",
      "structureSummary",
      "topK",
    ]);
    expect(fileSelectionModelOutputSchema.keyof().options.sort()).toEqual(
      Object.keys(fileSelectionModelOutputPromptContract).sort(),
    );
  });

  it("builds versioned semantic judgement prompts with schema-aligned input fields", () => {
    const prompt = buildSemanticJudgementPrompt({
      candidateFiles: [{ filePath: "src/auth/session.ts", recallSource: "llmSelected" }],
      claim: { id: "claim-1", text: "I implemented auth persistence." },
      evidenceSnippets: [
        {
          filePath: "src/auth/session.ts",
          id: "ev-1",
          lineEnd: 18,
          lineStart: 10,
          summary: "Stores auth token.",
          text: "localStorage.setItem('token', token)",
        },
      ],
      requirement: { id: "req-1", text: "Persist auth state." },
    });

    expect(SEMANTIC_JUDGEMENT_PROMPT_VERSION).toBe("semantic-judgement-v3");
    expect(prompt.system).toContain(SEMANTIC_JUDGEMENT_PROMPT_VERSION);
    expect(prompt.user).toContain("requirement");
    expect(prompt.user).toContain("claim");
    expect(prompt.user).toContain("evidenceSnippets");
    expect(prompt.user).toContain("candidateFiles");
    expect(prompt.user).toContain("judgementDraft");
    expect(prompt.user).toContain("repairSuggestion");

    const payload = JSON.parse(prompt.user) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "candidateFiles",
      "claim",
      "evidenceSnippets",
      "outputContract",
      "requirement",
    ]);
    expect(semanticJudgementDraftSchema.keyof().options.sort()).toEqual(
      Object.keys(semanticJudgementDraftPromptContract).sort(),
    );
  });
});
