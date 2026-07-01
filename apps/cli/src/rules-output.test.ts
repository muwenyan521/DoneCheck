import { buildJudgementReport } from "@donecheck/core";
import { judgementReportSchema } from "@donecheck/shared";
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
  it("formatRulesJson produces schema-valid JSON", () => {
    const json = formatRulesJson(report);
    const parsed = JSON.parse(json);
    expect(judgementReportSchema.parse(parsed)).toEqual(parsed);
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
