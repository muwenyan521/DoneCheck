import type { JudgementReport } from "../ipc-contract.js";

const generatedAt = "2026-07-01T00:00:00.000Z";

export const rendererFixtureReport: JudgementReport = {
  claimCoverage: {
    denominator: 6,
    excludedInsufficientEvidence: 1,
    score: 0.5,
    totalItems: 6,
    weightedFulfilled: 3,
  },
  consolidatedRepairPrompt: {
    content: { "zh-CN": "修复未兑现项。", en: "Repair unfulfilled items." },
    includedJudgementIds: [
      "J-partial",
      "J-insufficient",
      "J-unfulfilled",
      "J-suspicious",
      "J-extra",
    ],
    version: "repair-v1",
  },
  generatedAt,
  judgements: [
    buildJudgement("J-fulfilled", "fulfilled", "semantic-fulfilled-with-strong-evidence"),
    buildJudgement("J-partial", "partial", "semantic-partial-with-supporting-evidence"),
    buildJudgement("J-insufficient", "insufficient-evidence", "weak-or-unstable-evidence"),
    buildJudgement("J-unfulfilled", "unfulfilled", "semantic-unsupported-without-static-support"),
    buildJudgement(
      "J-suspicious",
      "suspicious-fake-implementation",
      "fake-implementation-signal-detected",
    ),
    buildJudgement("J-extra", "extra-scope", "extra-scope-detected", "extra-scope"),
  ],
  requirementCoverage: {
    denominator: 6,
    excludedInsufficientEvidence: 1,
    score: 0.67,
    totalItems: 6,
    weightedFulfilled: 4,
  },
  scopeDrift: {
    extraScopeCount: 2,
    level: "high",
    score: 0.33,
  },
  summaryStats: {
    "extra-scope": 1,
    fulfilled: 1,
    "insufficient-evidence": 1,
    partial: 1,
    "suspicious-fake-implementation": 1,
    unfulfilled: 1,
  },
  version: "rules-v1",
  warnings: ["fixture warning"],
};

function buildJudgement(
  id: string,
  finalStatus: JudgementReport["judgements"][number]["finalStatus"],
  reasonCode: JudgementReport["judgements"][number]["reasonCode"],
  kind: JudgementReport["judgements"][number]["kind"] = "requirement",
): JudgementReport["judgements"][number] {
  return {
    confidence: 0.8,
    confidenceLevel: "high",
    evidenceRefs: [
      {
        filePath: "src/login.ts",
        lineEnd: 1,
        lineStart: 1,
        snippetSummary: "Relevant implementation evidence",
      },
    ],
    explanation: "The available implementation evidence supports this result.",
    finalStatus,
    id,
    kind,
    reasonCode,
    semanticDraft: {
      confidence: 0.8,
      evidenceRefs: [
        {
          filePath: "src/login.ts",
          lineEnd: 1,
          lineStart: 1,
          snippetSummary: "Relevant implementation evidence",
        },
      ],
      explanation: "The implementation was evaluated against the requested behavior.",
      judgementDraft: finalStatus === "fulfilled" ? "fulfilled" : "partial",
      matchedRequirementId: "REQ-1",
      repairSuggestion: "Address the missing behavior and add verifiable evidence.",
    },
    signals: {
      evidenceStrength: "strong",
      fakeImplementationSignals: [],
      staticSignals: [{ filePath: "src/login.ts", keyword: "localStorage", strength: "strong" }],
    },
    sourceId: id,
  };
}
