import { describe, expect, it } from "vitest";
import { buildJudgementReport, calculateScopeDrift, evaluateFinalJudgement } from "./index.js";
import type { EvaluateJudgementsInput } from "./schema.js";

const evidenceRef = {
  filePath: "src/auth/session.ts",
  lineEnd: 12,
  lineStart: 10,
  snippetSummary: "Persists auth token in localStorage.",
};

describe("evaluateFinalJudgement", () => {
  it("returns fulfilled for semantic fulfilled with strong evidence and no fake implementation", () => {
    expect(
      evaluateFinalJudgement({
        item: { id: "req-1", kind: "requirement", sourceId: "req-1" },
        semanticDraft: {
          confidence: 0.9,
          evidenceRefs: [evidenceRef],
          explanation: "Persistence is implemented.",
          judgementDraft: "fulfilled",
          matchedRequirementId: "req-1",
          repairSuggestion: "No repair needed.",
        },
        signals: [{ filePath: "src/auth/session.ts", keyword: "localStorage", strength: "strong" }],
      }).finalStatus,
    ).toBe("fulfilled");
  });

  it("returns partial for semantic partial with medium evidence", () => {
    const judgement = evaluateFinalJudgement({
      item: { id: "req-1", kind: "requirement", sourceId: "req-1" },
      semanticDraft: {
        confidence: 0.72,
        evidenceRefs: [evidenceRef],
        explanation: "Only persistence skeleton is present.",
        judgementDraft: "partial",
        matchedRequirementId: "req-1",
        repairSuggestion: "Complete session validation.",
      },
      signals: [{ filePath: "src/auth/session.ts", keyword: "session", strength: "medium" }],
    });

    expect(judgement.finalStatus).toBe("partial");
    expect(judgement.reasonCode).toBe("semantic-partial-with-supporting-evidence");
  });

  it("returns suspicious-fake-implementation when suspicious draft has fake patterns", () => {
    const judgement = evaluateFinalJudgement({
      fakeImplementationSignals: [
        {
          filePath: "src/auth/session.ts",
          lineEnd: 18,
          lineStart: 18,
          pattern: "not-implemented",
          strength: "strong",
        },
      ],
      item: { id: "claim-1", kind: "claim", sourceId: "claim-1" },
      semanticDraft: {
        confidence: 0.8,
        evidenceRefs: [evidenceRef],
        explanation: "The implementation delegates to a placeholder.",
        judgementDraft: "suspicious",
        matchedClaimId: "claim-1",
        repairSuggestion: "Replace placeholder with real logic.",
      },
      signals: [{ filePath: "src/auth/session.ts", keyword: "TODO", strength: "medium" }],
    });

    expect(judgement.finalStatus).toBe("suspicious-fake-implementation");
    expect(judgement.reasonCode).toBe("fake-implementation-signal-detected");
  });

  it("returns unfulfilled for unsupported draft with almost no evidence", () => {
    const judgement = evaluateFinalJudgement({
      item: { id: "req-1", kind: "requirement", sourceId: "req-1" },
      semanticDraft: {
        confidence: 0.88,
        evidenceRefs: [evidenceRef],
        explanation: "No implementation support was found.",
        judgementDraft: "unsupported",
        matchedRequirementId: "req-1",
        repairSuggestion: "Implement auth persistence.",
      },
      signals: [],
    });

    expect(judgement.finalStatus).toBe("unfulfilled");
    expect(judgement.reasonCode).toBe("semantic-unsupported-without-static-support");
  });

  it("returns insufficient-evidence for weak unstable clues", () => {
    const judgement = evaluateFinalJudgement({
      item: { id: "req-1", kind: "requirement", sourceId: "req-1" },
      semanticDraft: {
        confidence: 0.35,
        evidenceRefs: [evidenceRef],
        explanation: "The snippet may be related but is too thin.",
        judgementDraft: "partial",
        matchedRequirementId: "req-1",
        repairSuggestion: "Collect stronger implementation evidence.",
      },
      signals: [{ filePath: "src/auth/session.ts", keyword: "auth", strength: "weak" }],
    });

    expect(judgement.finalStatus).toBe("insufficient-evidence");
    expect(judgement.reasonCode).toBe("weak-or-unstable-evidence");
  });

  it("returns extra-scope for an extra scope candidate", () => {
    const judgement = evaluateFinalJudgement({
      extraScopeCandidate: {
        evidenceRefs: [evidenceRef],
        id: "extra-1",
        sourceId: "extra-1",
        summary: "Adds unrelated admin dashboard.",
      },
      item: { id: "extra-1", kind: "extra-scope", sourceId: "extra-1" },
      signals: [{ filePath: "src/admin/dashboard.tsx", keyword: "admin", strength: "strong" }],
    });

    expect(judgement.finalStatus).toBe("extra-scope");
    expect(judgement.reasonCode).toBe("extra-scope-detected");
  });

  it("downgrades fulfilled draft to suspicious-fake-implementation when a confirmed fake signal is present", () => {
    const judgement = evaluateFinalJudgement({
      fakeImplementationSignals: [
        {
          filePath: "src/auth/session.ts",
          lineEnd: 12,
          lineStart: 10,
          pattern: "mock",
          strength: "strong",
        },
      ],
      item: { id: "req-1", kind: "requirement", sourceId: "req-1" },
      semanticDraft: {
        confidence: 0.9,
        evidenceRefs: [evidenceRef],
        explanation: "Persistence is implemented.",
        judgementDraft: "fulfilled",
        matchedRequirementId: "req-1",
        repairSuggestion: "No repair needed.",
      },
      signals: [{ filePath: "src/auth/session.ts", keyword: "localStorage", strength: "strong" }],
    });

    expect(judgement.finalStatus).toBe("suspicious-fake-implementation");
    expect(judgement.reasonCode).toBe("fake-implementation-signal-detected");
  });
});

describe("calculateScopeDrift", () => {
  it("returns low drift when there is no extra scope", () => {
    expect(calculateScopeDrift(0, 4)).toEqual({ extraScopeCount: 0, level: "low", score: 0 });
  });

  it("returns medium drift for a small amount of extra scope", () => {
    expect(calculateScopeDrift(1, 4)).toEqual({ extraScopeCount: 1, level: "medium", score: 0.25 });
  });

  it("returns high drift for a high extra scope ratio", () => {
    expect(calculateScopeDrift(3, 5)).toEqual({ extraScopeCount: 3, level: "high", score: 0.6 });
  });

  it("returns low drift with zero score when total judgements is zero", () => {
    expect(calculateScopeDrift(0, 0)).toEqual({ extraScopeCount: 0, level: "low", score: 0 });
  });
});

describe("buildJudgementReport", () => {
  it("builds a deterministic rules-v1 report from requirements, claims, drafts, signals, and extra scope", () => {
    const input: EvaluateJudgementsInput = {
      claims: [
        { id: "claim-1", text: "I persisted auth tokens." },
        { id: "claim-2", text: "I added complete logout." },
      ],
      extraScopeCandidates: [
        {
          evidenceRefs: [{ ...evidenceRef, filePath: "src/admin/dashboard.tsx" }],
          id: "extra-1",
          sourceId: "extra-1",
          summary: "Adds an unrelated admin dashboard.",
        },
      ],
      fakeImplementationSignals: [
        {
          filePath: "src/logout.ts",
          lineEnd: 5,
          lineStart: 5,
          pattern: "empty-handler",
          strength: "strong",
          targetId: "claim-2",
          targetKind: "claim",
        },
      ],
      generatedAt: "2026-06-27T00:00:00.000Z",
      requirements: [
        { id: "req-1", text: "Persist auth state in localStorage." },
        { id: "req-2", text: "Implement logout." },
      ],
      semanticDrafts: [
        {
          confidence: 0.92,
          evidenceRefs: [evidenceRef],
          explanation: "Auth persistence is implemented.",
          judgementDraft: "fulfilled",
          matchedClaimId: "claim-1",
          matchedRequirementId: "req-1",
          repairSuggestion: "No repair needed.",
        },
        {
          confidence: 0.82,
          evidenceRefs: [{ ...evidenceRef, filePath: "src/logout.ts" }],
          explanation: "Logout uses an empty handler.",
          judgementDraft: "suspicious",
          matchedClaimId: "claim-2",
          matchedRequirementId: "req-2",
          repairSuggestion: "Implement logout behavior.",
        },
      ],
      staticSignals: [
        {
          filePath: "src/auth/session.ts",
          keyword: "localStorage",
          strength: "strong",
          targetId: "req-1",
          targetKind: "requirement",
        },
        {
          filePath: "src/logout.ts",
          keyword: "onClick",
          strength: "medium",
          targetId: "claim-2",
          targetKind: "claim",
        },
      ],
    };

    const report = buildJudgementReport(input);

    expect(report.version).toBe("rules-v1");
    expect(report.generatedAt).toBe("2026-06-27T00:00:00.000Z");
    expect(report.judgements.map((judgement) => judgement.finalStatus)).toEqual([
      "fulfilled",
      "suspicious-fake-implementation",
      "fulfilled",
      "suspicious-fake-implementation",
      "extra-scope",
    ]);
    expect(report.summaryStats).toEqual({
      "extra-scope": 1,
      fulfilled: 2,
      "insufficient-evidence": 0,
      partial: 0,
      "suspicious-fake-implementation": 2,
      unfulfilled: 0,
    });
    expect(report.requirementCoverage.score).toBe(0.5);
    expect(report.claimCoverage.score).toBe(0.5);
    expect(report.scopeDrift).toEqual({ extraScopeCount: 1, level: "medium", score: 0.2 });
    expect(report.judgements.map((judgement) => judgement.reasonCode)).toContain(
      "fake-implementation-signal-detected",
    );
  });

  it("produces identical output for identical input to keep the rule engine pure", () => {
    const input: EvaluateJudgementsInput = {
      claims: [],
      extraScopeCandidates: [],
      fakeImplementationSignals: [],
      generatedAt: "2026-06-27T00:00:00.000Z",
      requirements: [{ id: "req-1", text: "Persist auth state in localStorage." }],
      semanticDrafts: [
        {
          confidence: 0.9,
          evidenceRefs: [evidenceRef],
          explanation: "Persistence is implemented.",
          judgementDraft: "fulfilled",
          matchedRequirementId: "req-1",
          repairSuggestion: "No repair needed.",
        },
      ],
      staticSignals: [
        {
          filePath: "src/auth/session.ts",
          keyword: "localStorage",
          strength: "strong",
          targetId: "req-1",
          targetKind: "requirement",
        },
      ],
    };

    expect(buildJudgementReport(input)).toEqual(buildJudgementReport(input));
  });

  it("rejects input without generatedAt to keep the rule engine pure", () => {
    const input = {
      claims: [],
      extraScopeCandidates: [],
      fakeImplementationSignals: [],
      requirements: [{ id: "req-1", text: "Persist auth state." }],
    };
    expect(() => buildJudgementReport(input as unknown as EvaluateJudgementsInput)).toThrow();
  });

  it("returns zero coverage denominator when all requirements are insufficient-evidence", () => {
    const report = buildJudgementReport({
      claims: [],
      extraScopeCandidates: [],
      fakeImplementationSignals: [],
      generatedAt: "2026-06-27T00:00:00.000Z",
      requirements: [
        { id: "req-1", text: "Persist auth state." },
        { id: "req-2", text: "Implement logout." },
      ],
      semanticDrafts: [],
      staticSignals: [],
    });

    expect(report.requirementCoverage).toEqual({
      denominator: 0,
      excludedInsufficientEvidence: 2,
      score: 0,
      totalItems: 2,
      weightedFulfilled: 0,
    });
    expect(report.summaryStats["insufficient-evidence"]).toBe(2);
  });
});
