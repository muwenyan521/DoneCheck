import { describe, expect, it } from "vitest";
import { selectCandidateFiles } from "./file-selection.js";
import type { LLMProvider } from "./provider.js";
import { draftSemanticJudgement } from "./semantic-judgement.js";

describe("phase 3 semantic integration slice", () => {
  it("runs file selection with static recall and semantic judgement draft", async () => {
    let calls = 0;
    const provider: LLMProvider = {
      async generateObject({ schema }) {
        calls += 1;
        const output =
          calls === 1
            ? {
                candidateFiles: ["src/ui/login-form.tsx"],
                confidence: 0.7,
                reasoningSummary: "Login UI is relevant.",
                warnings: [],
              }
            : {
                confidence: 0.83,
                evidenceRefs: [
                  {
                    filePath: "src/auth/session.ts",
                    lineEnd: 18,
                    lineStart: 10,
                    snippetSummary: "Stores auth token in localStorage.",
                  },
                ],
                explanation: "The static evidence supports auth persistence.",
                judgementDraft: "fulfilled",
                matchedClaimId: "claim-1",
                matchedRequirementId: "req-1",
                repairSuggestion: "No repair needed for persistence evidence.",
              };

        return {
          metadata: { model: "mock-model", provider: "mock", retries: 0 },
          object: schema.parse(output),
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        };
      },
    };

    const selection = await selectCandidateFiles({
      claim: "I implemented auth persistence.",
      provider,
      projectFiles: ["src/auth/session.ts", "src/ui/login-form.tsx"],
      requirement: "Persist auth state in localStorage.",
      staticSignals: [
        { filePath: "src/auth/session.ts", keyword: "localStorage", strength: "strong" },
      ],
      structureSummary: "src/auth/session.ts\nsrc/ui/login-form.tsx",
      topK: 5,
    });

    const judgement = await draftSemanticJudgement({
      candidateFiles: selection.candidateFiles.map((filePath) => ({
        filePath,
        recallSource: selection.staticallyRecalled.includes(filePath)
          ? "staticallyRecalled"
          : "llmSelected",
      })),
      claim: { id: "claim-1", text: "I implemented auth persistence." },
      evidenceSnippets: [
        {
          filePath: "src/auth/session.ts",
          id: "ev-1",
          lineEnd: 18,
          lineStart: 10,
          summary: "Stores auth token in localStorage.",
          text: "localStorage.setItem('token', token)",
        },
      ],
      provider,
      requirement: { id: "req-1", text: "Persist auth state in localStorage." },
    });

    expect(selection.llmSelected).toEqual(["src/ui/login-form.tsx"]);
    expect(selection.staticallyRecalled).toEqual(["src/auth/session.ts"]);
    expect(judgement.judgementDraft).toBe("fulfilled");
    expect(judgement.evidenceRefs[0]?.filePath).toBe("src/auth/session.ts");
  });
});
