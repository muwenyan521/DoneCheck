import type { FinalJudgement } from "@donecheck/shared";
import { describe, expect, it } from "vitest";
import { REPAIR_PROMPT_VERSION, buildConsolidatedRepairPrompt } from "./index.js";

const judgement = (id: string, finalStatus: FinalJudgement["finalStatus"]): FinalJudgement => ({
  confidence: 0.9,
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
          : finalStatus === "insufficient-evidence"
            ? "weak-or-unstable-evidence"
            : finalStatus === "fulfilled"
              ? "semantic-fulfilled-with-strong-evidence"
              : "semantic-partial-with-supporting-evidence",
  signals: { evidenceStrength: "strong", fakeImplementationSignals: [], staticSignals: [] },
  sourceId: id,
});

describe("buildConsolidatedRepairPrompt", () => {
  it("includes each actionable judgement's complete deterministic repair context", () => {
    const judgements = [
      judgement("partial", "partial"),
      judgement("unfulfilled", "unfulfilled"),
      judgement("suspicious", "suspicious-fake-implementation"),
      judgement("extra", "extra-scope"),
      judgement("insufficient", "insufficient-evidence"),
    ];
    const sourceTexts = {
      extra: "A separate administration dashboard was added.",
      insufficient: "Show evidence that session expiry is enforced.",
      partial: "Persist the session token after login.",
      suspicious: "Replace the empty logout handler.",
      unfulfilled: "Clear the session token on logout.",
    };

    const prompt = buildConsolidatedRepairPrompt(judgements, { sourceTexts });

    for (const locale of ["zh-CN", "en"] as const) {
      const content = prompt.content[locale];
      for (const item of judgements) {
        expect(content).toContain(sourceTexts[item.sourceId as keyof typeof sourceTexts]);
        expect(content).toContain(`src/${item.id}.ts:10-12`);
        expect(content).toContain(
          locale === "zh-CN"
            ? "根据说明和证据，仅进行必要的最小修复。"
            : "Make only the minimal change supported by the finding and evidence.",
        );
        expect(content).not.toContain(item.reasonCode);
      }
    }
    expect(prompt.content["zh-CN"]).toContain("请确认是否保留、移除或隐藏。");
    expect(prompt.content.en).toContain("Confirm whether to retain, remove, or hide.");
    expect(prompt.content.en).not.toContain("Delete extra-scope work");
    expect(prompt.content.en).toContain("only the necessary files");
    expect(prompt.content.en).toContain("do not add unrequested scope");
    expect(prompt.content["zh-CN"]).toContain("只修改必要文件");
    expect(prompt.content["zh-CN"]).toContain("不增加用户未要求的功能");
  });

  it("deterministically covers every non-fulfilled status and protects fulfilled work", () => {
    const judgements = [
      judgement("fulfilled", "fulfilled"),
      judgement("partial", "partial"),
      judgement("unfulfilled", "unfulfilled"),
      judgement("suspicious", "suspicious-fake-implementation"),
      judgement("extra", "extra-scope"),
      judgement("insufficient", "insufficient-evidence"),
    ];
    const prompt = buildConsolidatedRepairPrompt(judgements);

    expect(prompt).toEqual(buildConsolidatedRepairPrompt([...judgements]));
    expect(prompt.version).toBe(REPAIR_PROMPT_VERSION);
    expect(prompt.includedJudgementIds).toEqual([
      "partial",
      "unfulfilled",
      "suspicious",
      "extra",
      "insufficient",
    ]);
    expect(Object.keys(prompt.content)).toEqual(["zh-CN", "en"]);
    for (const content of Object.values(prompt.content)) {
      expect(content).toContain("src/partial.ts:10-12");
      for (const internalTerm of [
        "semantic-partial-with-supporting-evidence",
        "semantic-unsupported-without-static-support",
        "fake-implementation-signal-detected",
        "extra-scope-detected",
        "weak-or-unstable-evidence",
      ]) {
        expect(content).not.toContain(internalTerm);
      }
      expect(content).toMatch(/minimal|最小/u);
      expect(content).toMatch(/do not rewrite|不要重写/iu);
      expect(content).toMatch(/scope|范围/iu);
    }
  });

  it("never exposes internal identifiers when source text is unavailable", () => {
    const sourceId = "REQ-INTERNAL-DO-NOT-SHOW";
    const item = {
      ...judgement(sourceId, "unfulfilled"),
      evidenceRefs: [],
    };

    const prompt = buildConsolidatedRepairPrompt([item]);

    expect(prompt.content.en).toContain("Requirement requiring attention");
    expect(prompt.content["zh-CN"]).toContain("需要处理的需求");
    for (const content of Object.values(prompt.content)) {
      expect(content).not.toContain(sourceId);
      expect(content).not.toContain(item.reasonCode);
    }
  });
});
