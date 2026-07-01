import {
  type CheckResult,
  DONECHECK_SCHEMA_VERSION,
  type DoneCheckResult,
  type Evidence,
  type Requirement,
  parseCheckResult,
  parseDoneCheckResult,
  parseEvidence,
  parseRequirement,
} from "@donecheck/shared";

export interface AnalyzeInput {
  readonly requirement: Requirement | string;
  readonly evidence: Evidence | readonly Evidence[] | string;
}

export interface CheckContext {
  readonly requirement: Requirement;
  readonly evidence: readonly Evidence[];
}

export interface AnalysisCheck {
  readonly description: string;
  readonly id: string;
  run(context: CheckContext): CheckResult;
}

const stopWords = new Set(["and", "the", "with", "that", "this", "是否", "真正", "完成"]);

export function analyze(input: AnalyzeInput): DoneCheckResult {
  const context = normalizeInput(input);
  const checkResults = defaultChecks.map((check) => parseCheckResult(check.run(context)));
  const score = roundScore(
    checkResults.reduce((total, checkResult) => total + checkResult.score, 0) / checkResults.length,
  );
  const failedCount = checkResults.filter((checkResult) => checkResult.status === "fail").length;
  const partialCount = checkResults.filter(
    (checkResult) => checkResult.status === "partial",
  ).length;
  const passedCount = checkResults.filter((checkResult) => checkResult.status === "pass").length;
  const status =
    passedCount === checkResults.length
      ? "pass"
      : failedCount === checkResults.length
        ? "fail"
        : "partial";

  return parseDoneCheckResult({
    checkedAt: new Date().toISOString(),
    checkResults,
    score,
    status,
    summary: `DoneCheck ${DONECHECK_SCHEMA_VERSION}: ${passedCount} checks passed, ${partialCount} partial, ${failedCount} failed. Overall score ${Math.round(score * 100)}%.`,
  });
}

export const requirementPresentCheck: AnalysisCheck = {
  description: "Requirement text must be present before DoneCheck can assess completion.",
  id: "requirement-present",
  run(context) {
    const present = context.requirement.text.trim().length > 0;
    return {
      checkId: "requirement-present",
      message: present ? "Requirement text is present." : "Requirement text is required.",
      score: present ? 1 : 0,
      status: present ? "pass" : "fail",
    };
  },
};

export const evidencePresentCheck: AnalysisCheck = {
  description: "At least one evidence item must contain text.",
  id: "evidence-present",
  run(context) {
    const present = context.evidence.some((item) => item.text.trim().length > 0);
    return {
      checkId: "evidence-present",
      message: present ? "Evidence text is present." : "Evidence text is required.",
      score: present ? 1 : 0,
      status: present ? "pass" : "fail",
    };
  },
};

export const coverageKeywordsCheck: AnalysisCheck = {
  description: "Evidence should cover meaningful keywords from the requirement.",
  id: "keyword-coverage",
  run(context) {
    const keywords = extractKeywords(context.requirement.text);
    const evidenceText = context.evidence
      .map((item) => item.text)
      .join(" ")
      .toLocaleLowerCase();
    const coveredCount = keywords.filter((keyword) =>
      containsKeyword(evidenceText, keyword),
    ).length;
    const coverage = keywords.length === 0 ? 0 : coveredCount / keywords.length;
    const score = roundScore(coverage);
    const status = score === 1 ? "pass" : score > 0 ? "partial" : "fail";

    return {
      checkId: "keyword-coverage",
      message: `Evidence covers ${coveredCount} of ${keywords.length} requirement keywords.`,
      score,
      status,
    };
  },
};

export const defaultChecks: readonly AnalysisCheck[] = Object.freeze([
  requirementPresentCheck,
  evidencePresentCheck,
  coverageKeywordsCheck,
]);

function normalizeInput(input: AnalyzeInput): CheckContext {
  return {
    evidence: normalizeEvidence(input.evidence),
    requirement: normalizeRequirement(input.requirement),
  };
}

function normalizeRequirement(requirement: Requirement | string): Requirement {
  if (typeof requirement === "string") {
    return { id: "requirement", text: requirement };
  }

  return parseRequirement(requirement);
}

function normalizeEvidence(evidence: Evidence | readonly Evidence[] | string): readonly Evidence[] {
  const evidenceItems = Array.isArray(evidence) ? evidence : [evidence];
  return evidenceItems.map((item, index) => normalizeEvidenceItem(item, index));
}

function normalizeEvidenceItem(evidence: Evidence | string, index: number): Evidence {
  if (typeof evidence === "string") {
    return { id: evidenceId(index), source: "input", text: evidence };
  }

  return parseEvidence(evidence);
}

function evidenceId(index: number): string {
  return `evidence-${index + 1}`;
}

function extractKeywords(text: string): readonly string[] {
  const words = text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const uniqueWords = new Set<string>();

  for (const word of words) {
    if (word.length < 4 || stopWords.has(word)) continue;
    uniqueWords.add(word);
  }

  return [...uniqueWords];
}

function containsKeyword(text: string, keyword: string): boolean {
  if (isLatinKeyword(keyword)) {
    return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "u").test(text);
  }

  return text.includes(keyword);
}

function isLatinKeyword(keyword: string): boolean {
  return /^[\p{Script=Latin}\p{N}_]+$/u.test(keyword);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function roundScore(score: number): number {
  return Math.round(score * 100) / 100;
}

export * from "./static-signals/index.js";
export * from "./evidence/index.js";
export * from "./pipeline/index.js";
export { buildJudgementReport, evaluateJudgements } from "./rules/index.js";
export type { JudgementReport } from "./rules/index.js";
export type {
  GenerateObjectInput,
  GenerateObjectResult,
  LLMPrompt,
  LLMProvider,
  LLMProviderMetadata,
  LLMUsage,
} from "./semantic/provider.js";
