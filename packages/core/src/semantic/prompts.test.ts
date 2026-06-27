import { describe, expect, it } from "vitest";
import {
  FILE_SELECTION_PROMPT_VERSION,
  buildFileSelectionPrompt,
} from "../prompts/file-selection.js";
import {
  SEMANTIC_JUDGEMENT_PROMPT_VERSION,
  buildSemanticJudgementPrompt,
} from "../prompts/semantic-judgement.js";

describe("phase 3 prompts", () => {
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
  });
});
