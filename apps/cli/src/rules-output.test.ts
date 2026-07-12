import { buildJudgementReport } from "@donecheck/core";
import { describe, expect, it } from "vitest";
import { formatHtml, formatRulesJson } from "./rules-output.js";

const report = buildJudgementReport({
  claims: [],
  extraScopeCandidates: [],
  fakeImplementationSignals: [],
  generatedAt: "2026-01-01T00:00:00.000Z",
  requirements: [{ id: "REQ-1", text: "Test requirement" }],
  semanticDrafts: [],
  staticSignals: [],
});

describe("rules-output", () => {
  it("formatRulesJson exposes only the documented user-facing report", () => {
    const json = formatRulesJson(report);
    const parsed = JSON.parse(json);

    expect(parsed.generatedAt).toBe(report.generatedAt);
    expect(parsed.requirementCoverage).toEqual(report.requirementCoverage);
    expect(parsed.judgements[0]).toMatchObject({
      confidence: report.judgements[0]?.confidence,
      certainty: "Low",
      explanation: report.judgements[0]?.explanation,
      itemType: "Requirement",
      status: "Insufficient Evidence",
    });
    expect(parsed.outcomeSummary).toEqual([
      { count: 0, status: "Fulfilled" },
      { count: 0, status: "Partial" },
      { count: 1, status: "Insufficient Evidence" },
      { count: 0, status: "Unfulfilled" },
      { count: 0, status: "Appears Complete Without Working Evidence" },
      { count: 0, status: "Extra Scope" },
    ]);
    for (const internalField of [
      '"version"',
      '"id"',
      '"sourceId"',
      '"reasonCode"',
      '"semanticDraft"',
      '"signals"',
      '"includedJudgementIds"',
      '"finalStatus"',
      '"summaryStats"',
      "insufficient-evidence",
      "suspicious-fake-implementation",
      "extra-scope",
    ]) {
      expect(json).not.toContain(internalField);
    }
  });

  it("formatRulesJson ends with a newline", () => {
    expect(formatRulesJson(report).endsWith("\n")).toBe(true);
  });

  it("formatHtml produces an HTML document", () => {
    const html = formatHtml(report);
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });

  it("formatHtml honors locale", () => {
    const html = formatHtml(report, "zh-CN");
    expect(html).toContain('lang="zh-CN"');
  });
});
