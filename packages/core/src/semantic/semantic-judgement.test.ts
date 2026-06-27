import { describe, expect, it } from "vitest";
import type { LLMProvider } from "./provider.js";
import { draftSemanticJudgement, draftSemanticJudgements } from "./semantic-judgement.js";

function providerReturning(output: unknown): LLMProvider {
  return {
    async generateObject({ schema }) {
      return {
        metadata: {
          model: "mock-model",
          provider: "mock",
          retries: 0,
        },
        object: schema.parse(output),
        usage: {
          inputTokens: 30,
          outputTokens: 20,
          totalTokens: 50,
        },
      };
    },
  };
}

describe("draftSemanticJudgement", () => {
  it("returns a structured judgement draft for requirement, claim, and evidence", async () => {
    const result = await draftSemanticJudgement({
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
      provider: providerReturning({
        confidence: 0.91,
        evidenceRefs: [
          {
            filePath: "src/auth/session.ts",
            lineEnd: 18,
            lineStart: 10,
            snippetSummary: "Stores auth token in localStorage.",
          },
        ],
        explanation: "The implementation persists the token.",
        judgementDraft: "fulfilled",
        matchedClaimId: "claim-1",
        matchedRequirementId: "req-1",
        repairSuggestion: "No repair needed for this requirement.",
      }),
      requirement: { id: "req-1", text: "Persist auth state." },
    });

    expect(result.judgementDraft).toBe("fulfilled");
    expect(result.matchedRequirementId).toBe("req-1");
    expect(result.matchedClaimId).toBe("claim-1");
    expect(result.evidenceRefs).toHaveLength(1);
  });

  it("supports judgement without an AI claim", async () => {
    const result = await draftSemanticJudgement({
      evidenceSnippets: [
        {
          filePath: "src/ui/login-form.tsx",
          id: "ev-1",
          lineEnd: 7,
          lineStart: 3,
          summary: "Login form exists.",
          text: "export function LoginForm() {}",
        },
      ],
      provider: providerReturning({
        confidence: 0.66,
        evidenceRefs: [
          {
            filePath: "src/ui/login-form.tsx",
            lineEnd: 7,
            lineStart: 3,
            snippetSummary: "Login form exists.",
          },
        ],
        explanation: "The UI exists but persistence is not shown.",
        judgementDraft: "partial",
        matchedRequirementId: "req-1",
        repairSuggestion: "Add evidence that auth state persists across reloads.",
      }),
      requirement: { id: "req-1", text: "Persist auth state." },
    });

    expect(result.matchedClaimId).toBeUndefined();
    expect(result.judgementDraft).toBe("partial");
  });

  it("rejects empty evidenceRefs from provider output", async () => {
    await expect(
      draftSemanticJudgement({
        evidenceSnippets: [],
        provider: providerReturning({
          confidence: 0.2,
          evidenceRefs: [],
          explanation: "No evidence supports the requirement.",
          judgementDraft: "unsupported",
          matchedRequirementId: "req-1",
          repairSuggestion: "Provide implementation evidence.",
        }),
        requirement: { id: "req-1", text: "Persist auth state." },
      }),
    ).rejects.toThrow();
  });

  it("rejects evidence refs that do not match provided candidate snippets", async () => {
    await expect(
      draftSemanticJudgement({
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
        provider: providerReturning({
          confidence: 0.7,
          evidenceRefs: [
            {
              filePath: "src/auth/missing.ts",
              lineEnd: 3,
              lineStart: 1,
              snippetSummary: "Missing file.",
            },
          ],
          explanation: "References missing evidence.",
          judgementDraft: "suspicious",
          matchedRequirementId: "req-1",
          repairSuggestion: "Check evidence extraction.",
        }),
        requirement: { id: "req-1", text: "Persist auth state." },
      }),
    ).rejects.toThrow("not present in candidate evidence snippets");
  });

  it("retries provider failures and returns the final successful draft", async () => {
    let attempts = 0;
    const provider: LLMProvider = {
      async generateObject({ schema }) {
        attempts += 1;
        if (attempts < 3) throw new Error("temporary provider failure");

        return {
          metadata: { model: "mock-model", provider: "mock", retries: attempts - 1 },
          object: schema.parse({
            confidence: 0.76,
            evidenceRefs: [
              {
                filePath: "src/auth/session.ts",
                lineEnd: 18,
                lineStart: 10,
                snippetSummary: "Stores auth token.",
              },
            ],
            explanation: "Evidence supports a partial implementation.",
            judgementDraft: "partial",
            matchedRequirementId: "req-1",
            repairSuggestion: "Add reload persistence verification.",
          }),
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
      },
    };

    const result = await draftSemanticJudgement({
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
      provider,
      requirement: { id: "req-1", text: "Persist auth state." },
      retry: { baseDelayMs: 0, maxAttempts: 3 },
    });

    expect(attempts).toBe(3);
    expect(result.judgementDraft).toBe("partial");
  });

  it("surfaces provider failure after retries are exhausted", async () => {
    let attempts = 0;
    const provider: LLMProvider = {
      async generateObject() {
        attempts += 1;
        throw new Error("provider unavailable");
      },
    };

    await expect(
      draftSemanticJudgement({
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
        provider,
        requirement: { id: "req-1", text: "Persist auth state." },
        retry: { baseDelayMs: 0, maxAttempts: 2 },
      }),
    ).rejects.toThrow("provider unavailable");
    expect(attempts).toBe(2);
  });

  it("keeps judgementDraft separate from final pass fail partial status", async () => {
    const result = await draftSemanticJudgement({
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
      provider: providerReturning({
        confidence: 0.55,
        evidenceRefs: [
          {
            filePath: "src/auth/session.ts",
            lineEnd: 18,
            lineStart: 10,
            snippetSummary: "Stores auth token.",
          },
        ],
        explanation: "The evidence is suspicious because tests are absent.",
        judgementDraft: "suspicious",
        matchedRequirementId: "req-1",
        repairSuggestion: "Add a test proving persistence behavior.",
      }),
      requirement: { id: "req-1", text: "Persist auth state." },
    });

    expect(["fulfilled", "unsupported", "suspicious"]).toContain(result.judgementDraft);
    expect(["pass", "fail"]).not.toContain(result.judgementDraft);
  });

  it("preserves possibleExtraScope when the provider returns it", async () => {
    const result = await draftSemanticJudgement({
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
      provider: providerReturning({
        confidence: 0.88,
        evidenceRefs: [
          {
            filePath: "src/auth/session.ts",
            lineEnd: 18,
            lineStart: 10,
            snippetSummary: "Stores auth token.",
          },
        ],
        explanation: "Fulfilled, but related token-refresh logic is out of scope.",
        judgementDraft: "fulfilled",
        matchedRequirementId: "req-1",
        possibleExtraScope: ["src/auth/token-refresh.ts", "src/auth/expiry.ts"],
        repairSuggestion: "Consider verifying token refresh in a follow-up requirement.",
      }),
      requirement: { id: "req-1", text: "Persist auth state." },
    });

    expect(result.judgementDraft).toBe("fulfilled");
    expect(result.possibleExtraScope).toEqual(["src/auth/token-refresh.ts", "src/auth/expiry.ts"]);
  });

  it("rejects invalid provider output at the business layer when provider skips schema validation", async () => {
    const rawProvider: LLMProvider = {
      async generateObject<T>() {
        return {
          metadata: { model: "mock-model", provider: "mock", retries: 0 },
          object: { judgementDraft: "pass", evidenceRefs: [] } as unknown as T,
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        };
      },
    };

    await expect(
      draftSemanticJudgement({
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
        provider: rawProvider,
        requirement: { id: "req-1", text: "Persist auth state." },
      }),
    ).rejects.toThrow();
  });
});

describe("draftSemanticJudgements", () => {
  it("processes requirement items with a concurrency limit", async () => {
    const result = await draftSemanticJudgements({
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
      provider: providerReturning({
        confidence: 0.8,
        evidenceRefs: [
          {
            filePath: "src/auth/session.ts",
            lineEnd: 18,
            lineStart: 10,
            snippetSummary: "Stores auth token.",
          },
        ],
        explanation: "Evidence supports the requirement.",
        judgementDraft: "fulfilled",
        matchedRequirementId: "req-1",
        repairSuggestion: "No repair needed.",
      }),
      requirements: [
        { id: "req-1", text: "Persist auth state." },
        { id: "req-2", text: "Restore auth state on reload." },
      ],
      concurrency: 1,
    });

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.judgementDraft)).toEqual(["fulfilled", "fulfilled"]);
  });
});
