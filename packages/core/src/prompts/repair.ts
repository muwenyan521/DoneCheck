import type { ConsolidatedRepairPrompt, FinalJudgement } from "@donecheck/shared";

export const REPAIR_PROMPT_VERSION = "repair-v1";

export interface BuildConsolidatedRepairPromptOptions {
  readonly sourceTexts?: Readonly<Record<string, string>>;
}

export function buildConsolidatedRepairPrompt(
  judgements: readonly FinalJudgement[],
  options: BuildConsolidatedRepairPromptOptions = {},
): ConsolidatedRepairPrompt {
  const actionable = judgements.filter((judgement) => judgement.finalStatus !== "fulfilled");
  const zhFindings = actionable.map((judgement) => formatZh(judgement, options.sourceTexts));
  const enFindings = actionable.map((judgement) => formatEn(judgement, options.sourceTexts));

  return {
    version: REPAIR_PROMPT_VERSION,
    content: {
      "zh-CN": [
        actionable.length === 0
          ? "DoneCheck 没有发现需要处理的问题。"
          : "请逐项处理以下 DoneCheck 发现：",
        zhFindings.join("\n\n"),
        "保护已经正确完成的工作：不要重写已验证的实现。只修改必要文件，采用最小改动，不扩大范围，不增加用户未要求的功能。",
      ].join("\n"),
      en: [
        actionable.length === 0
          ? "DoneCheck found no issues that need action."
          : "Address each DoneCheck finding below:",
        enFindings.join("\n\n"),
        "Protect work already verified as complete: do not rewrite it. Modify only the necessary files, keep changes minimal, and do not add unrequested scope.",
      ].join("\n"),
    },
    includedJudgementIds: actionable.map((judgement) => judgement.id),
  };
}

function formatZh(
  judgement: FinalJudgement,
  sourceTexts: Readonly<Record<string, string>> | undefined,
): string {
  return [
    `- ${sourceTexts?.[judgement.sourceId] ?? fallbackSourceZh[judgement.kind]}`,
    `类型：${kindZh[judgement.kind]}`,
    `说明：${explanationZh[judgement.reasonCode]}`,
    `证据位置：${formatEvidence(judgement, "未找到具体位置")}`,
    `建议：${repairSuggestionZh(judgement)}`,
    ...(judgement.finalStatus === "extra-scope" ? ["请确认是否保留、移除或隐藏。"] : []),
  ].join("\n");
}

function formatEn(
  judgement: FinalJudgement,
  sourceTexts: Readonly<Record<string, string>> | undefined,
): string {
  return [
    `- ${sourceTexts?.[judgement.sourceId] ?? fallbackSourceEn[judgement.kind]}`,
    `Type: ${kindEn[judgement.kind]}`,
    `Finding: ${explanationEn[judgement.reasonCode]}`,
    `Evidence: ${formatEvidence(judgement, "No specific location found")}`,
    `Suggested action: ${repairSuggestionEn(judgement)}`,
    ...(judgement.finalStatus === "extra-scope"
      ? ["Confirm whether to retain, remove, or hide."]
      : []),
  ].join("\n");
}

function repairSuggestionZh(judgement: FinalJudgement): string {
  return sanitizePublicText(
    judgement.semanticDraft?.repairSuggestion ?? "根据说明和证据，仅进行必要的最小修复。",
  );
}

function repairSuggestionEn(judgement: FinalJudgement): string {
  return sanitizePublicText(
    judgement.semanticDraft?.repairSuggestion ??
      "Make only the minimal change supported by the finding and evidence.",
  );
}

function sanitizePublicText(value: string): string {
  return value
    .replace(/\b(?:REQ|CLAIM)-[A-Z0-9_-]+\b/giu, "the relevant item")
    .replace(
      /\b(?:extra-scope-detected|fake-implementation-signal-detected|missing-semantic-draft|semantic-[a-z-]+|suspicious-without-confirmed-fake-signal|weak-or-unstable-evidence)\b/giu,
      "the finding",
    );
}

function formatEvidence(judgement: FinalJudgement, emptyLabel: string): string {
  const refs = judgement.evidenceRefs.map(
    (ref) => `${ref.filePath}:${ref.lineStart}-${ref.lineEnd}`,
  );
  return refs.length === 0 ? emptyLabel : refs.join(", ");
}

const kindZh: Record<FinalJudgement["kind"], string> = {
  claim: "承诺",
  "extra-scope": "需求外工作",
  requirement: "需求",
};

const kindEn: Record<FinalJudgement["kind"], string> = {
  claim: "Claim",
  "extra-scope": "Work outside the request",
  requirement: "Requirement",
};

const fallbackSourceZh: Record<FinalJudgement["kind"], string> = {
  claim: "需要处理的完成声明",
  "extra-scope": "需要确认的需求外工作",
  requirement: "需要处理的需求",
};

const fallbackSourceEn: Record<FinalJudgement["kind"], string> = {
  claim: "Completion claim requiring attention",
  "extra-scope": "Work outside the request requiring confirmation",
  requirement: "Requirement requiring attention",
};

const explanationZh: Record<FinalJudgement["reasonCode"], string> = {
  "extra-scope-detected": "这项工作似乎超出了用户要求的范围。",
  "fake-implementation-signal-detected": "现有证据表明这项功能可能尚未真正生效。",
  "missing-semantic-draft": "目前没有足够证据验证这一项。",
  "semantic-fulfilled-with-incomplete-evidence": "这一项看起来已经完成，但部分佐证仍不完整。",
  "semantic-fulfilled-with-strong-evidence": "现有证据支持这一项已经完成。",
  "semantic-partial-with-supporting-evidence": "现有证据只支持这一项的部分内容。",
  "semantic-unsupported-without-static-support": "没有找到这一项的实现证据。",
  "suspicious-without-confirmed-fake-signal": "这项实现仍不确定，需要进一步验证。",
  "weak-or-unstable-evidence": "现有证据过弱，无法验证这一项。",
};

const explanationEn: Record<FinalJudgement["reasonCode"], string> = {
  "extra-scope-detected": "This work appears to be outside the requested scope.",
  "fake-implementation-signal-detected":
    "The available evidence suggests this feature may not work yet.",
  "missing-semantic-draft": "There is not enough evidence to verify this item.",
  "semantic-fulfilled-with-incomplete-evidence":
    "This item appears complete, but some supporting evidence is incomplete.",
  "semantic-fulfilled-with-strong-evidence":
    "The available evidence supports that this item is complete.",
  "semantic-partial-with-supporting-evidence":
    "The available evidence supports only part of this item.",
  "semantic-unsupported-without-static-support":
    "No implementation evidence was found for this item.",
  "suspicious-without-confirmed-fake-signal":
    "This implementation remains uncertain and needs further verification.",
  "weak-or-unstable-evidence": "The available evidence is too weak to verify this item.",
};
