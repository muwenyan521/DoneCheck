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

    expect(REQUIREMENT_DECOMPOSITION_PROMPT_VERSION).toBe("requirement-decomposition-v1");
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

    expect(FILE_SELECTION_PROMPT_VERSION).toBe("file-selection-v1");
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

    expect(SEMANTIC_JUDGEMENT_PROMPT_VERSION).toBe("semantic-judgement-v1");
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
