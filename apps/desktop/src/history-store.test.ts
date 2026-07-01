import { describe, expect, it } from "vitest";
import { createHistoryStore } from "./history-store.js";
import type { JudgementReport } from "./ipc-contract.js";

describe("history store", () => {
  it("persists complete JudgementReport JSON losslessly with real better-sqlite3", () => {
    const store = createHistoryStore({ databasePath: ":memory:" });
    const report = buildRichReport();

    const saved = store.save({
      report,
      requirement:
        "Users can log in, persist sessions, recover failed attempts, and avoid unrelated profile rewrites.",
      workspaceDir: "/workspace/demo",
    });

    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(saved.createdAt).toEqual(expect.any(String));
    expect(saved.workspaceDir).toBe("/workspace/demo");
    expect(saved.requirementSummary).toBe(
      "Users can log in, persist sessions, recover failed attempts, and avoid unrelated profile rewrites.",
    );
    expect(saved.report).toEqual(report);

    const list = store.list();
    expect(list).toEqual([
      {
        createdAt: saved.createdAt,
        id: saved.id,
        requirementSummary: saved.requirementSummary,
        workspaceDir: "/workspace/demo",
      },
    ]);
    expect(list[0]).toBeDefined();
    if (list[0] === undefined) throw new Error("expected one history summary");
    expect("report" in list[0]).toBe(false);

    const loaded = store.get({ id: saved.id });
    expect(loaded?.report).toEqual(report);

    expect(store.delete({ id: saved.id })).toEqual({ deleted: true });
    expect(store.list().some((entry) => entry.id === saved.id)).toBe(false);
    expect(store.get({ id: saved.id })).toBeUndefined();
    expect(store.delete({ id: saved.id })).toEqual({ deleted: false });

    store.close();
  });
});

function buildRichReport(): JudgementReport {
  return {
    claimCoverage: {
      denominator: 5,
      excludedInsufficientEvidence: 1,
      score: 0.58,
      totalItems: 6,
      weightedFulfilled: 2.9,
    },
    generatedAt: "2026-07-01T00:00:00.000Z",
    judgements: [
      judgement("REQ-1", "fulfilled", "semantic-fulfilled-with-strong-evidence"),
      judgement("REQ-2", "partial", "semantic-partial-with-supporting-evidence"),
      judgement("REQ-3", "insufficient-evidence", "weak-or-unstable-evidence"),
      judgement("REQ-4", "unfulfilled", "semantic-unsupported-without-static-support"),
      judgement("REQ-5", "suspicious-fake-implementation", "fake-implementation-signal-detected"),
      judgement("EXTRA-1", "extra-scope", "extra-scope-detected", "extra-scope"),
    ],
    requirementCoverage: {
      denominator: 5,
      excludedInsufficientEvidence: 1,
      score: 0.7,
      totalItems: 6,
      weightedFulfilled: 3.5,
    },
    scopeDrift: {
      extraScopeCount: 1,
      level: "medium",
      score: 0.17,
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
    warnings: ["optional warning is preserved", "second warning survives JSON blob roundtrip"],
  };
}

function judgement(
  sourceId: string,
  finalStatus: JudgementReport["judgements"][number]["finalStatus"],
  reasonCode: JudgementReport["judgements"][number]["reasonCode"],
  kind: JudgementReport["judgements"][number]["kind"] = "requirement",
): JudgementReport["judgements"][number] {
  return {
    confidence: 0.76,
    confidenceLevel: "medium",
    evidenceRefs: [
      {
        filePath: `src/${sourceId}.ts`,
        lineEnd: 20,
        lineStart: 10,
        snippetSummary: `${sourceId} evidence summary`,
      },
    ],
    explanation: `${sourceId} explanation`,
    finalStatus,
    id: `J-${sourceId}`,
    kind,
    reasonCode,
    semanticDraft: {
      confidence: 0.65,
      evidenceRefs: [
        {
          filePath: `src/${sourceId}.ts`,
          lineEnd: 30,
          lineStart: 22,
          snippetSummary: `${sourceId} semantic evidence`,
        },
      ],
      explanation: `${sourceId} semantic explanation`,
      judgementDraft: finalStatus === "fulfilled" ? "fulfilled" : "partial",
      matchedRequirementId: sourceId,
      repairSuggestion: `${sourceId} semantic repair`,
    },
    signals: {
      evidenceStrength: "strong",
      fakeImplementationSignals:
        finalStatus === "suspicious-fake-implementation"
          ? [{ filePath: `src/${sourceId}.ts`, pattern: "todo", strength: "strong" }]
          : [],
      staticSignals: [
        { filePath: `src/${sourceId}.ts`, keyword: "localStorage", strength: "strong" },
        { filePath: `src/${sourceId}.ts`, keyword: "session", strength: "weak" },
      ],
    },
    sourceId,
  };
}
