import type { FinalJudgement } from "@donecheck/shared";
import { describe, expect, it } from "vitest";
import { REPAIR_PROMPT_VERSION, buildConsolidatedRepairPrompt } from "./index.js";

const judgement = (id: string, finalStatus: FinalJudgement["finalStatus"]): FinalJudgement => ({
  confidence: 0.8,
  confidenceLevel: "high",
  evidenceRefs: [{ filePath: `src/${id}.ts`, lineEnd: 12, lineStart: 10, snippetSummary: id }],
  explanation: `${id} explanation`,
  finalStatus,
  id,
  kind: finalStatus === "extra-scope" ? "extra-scope" : "requirement",
  reasonCode:
    finalStatus === "extra-scope"
      ? "extra-scope-detected"
      : finalStatus === "suspicious-fake-implementation"
        ? "fake-implementation-signal-detected"
        : finalStatus === "unfulfilled"
          ? "semantic-unsupported-without-static-support"
          : finalStatus === "fulfilled"
            ? "semantic-fulfilled-with-strong-evidence"
            : finalStatus === "partial"
              ? "semantic-partial-with-supporting-evidence"
              : "weak-or-unstable-evidence",
  ...(id === "partial"
    ? {
        semanticDraft: {
          confidence: 0.8,
          evidenceRefs: [
            { filePath: "src/partial.ts", lineEnd: 12, lineStart: 10, snippetSummary: "partial" },
          ],
          explanation: "partial semantic explanation",
          judgementDraft: "partial" as const,
          repairSuggestion: "Persist the session token in storage.",
        },
      }
    : {}),
  signals: { evidenceStrength: "strong", fakeImplementationSignals: [], staticSignals: [] },
  sourceId: id,
});

describe("buildConsolidatedRepairPrompt", () => {
  it("builds deterministic bilingual repair instructions for every non-fulfilled status", () => {
    const judgements = [
      judgement("fulfilled", "fulfilled"),
      judgement("partial", "partial"),
      judgement("unfulfilled", "unfulfilled"),
      judgement("suspicious", "suspicious-fake-implementation"),
      judgement("extra", "extra-scope"),
      judgement("insufficient", "insufficient-evidence"),
    ];

    const sourceTexts = {
      extra: "An unrelated admin dashboard was added.",
      insufficient: "Provide audit evidence for session expiry.",
      partial: "Persist the session token after login.",
      suspicious: "Replace the empty logout handler.",
      unfulfilled: "Clear the session token on logout.",
    };
    const first = buildConsolidatedRepairPrompt(judgements, { sourceTexts });
    const second = buildConsolidatedRepairPrompt(judgements, { sourceTexts });

    expect(first).toEqual(second);
    expect(first.version).toBe(REPAIR_PROMPT_VERSION);
    expect(first.includedJudgementIds).toEqual([
      "partial",
      "unfulfilled",
      "suspicious",
      "extra",
      "insufficient",
    ]);
    for (const locale of ["zh-CN", "en"] as const) {
      expect(first.content[locale]).toContain("src/partial.ts:10-12");
      expect(first.content[locale]).toContain("Persist the session token after login.");
      expect(first.content[locale]).toContain("Persist the session token in storage.");
      for (const internalTerm of [
        "semantic-partial-with-supporting-evidence",
        "suspicious-fake-implementation",
        "extra-scope-detected",
        "rules-v1",
      ]) {
        expect(first.content[locale]).not.toContain(internalTerm);
      }
    }
    expect(first.content.en).toContain("Replace the empty logout handler.");
    expect(first.content.en).toContain("Confirm whether to retain, remove, or hide.");
    expect(first.content["zh-CN"]).toContain("请确认是否保留、移除或隐藏。");
    expect(first.content.en).toContain("do not rewrite it");
    expect(first.content.en).toContain("only the necessary files");
    expect(first.content.en).toContain("do not add unrequested scope");
    expect(first.content["zh-CN"]).toContain("不要重写已验证的实现");
    expect(first.content["zh-CN"]).toContain("只修改必要文件");
    expect(first.content["zh-CN"]).toContain("不扩大范围");
  });
});
