import type { JudgementReport } from "@donecheck/core";
import {
  type Locale,
  createHtmlReportDocument,
  translate,
  translateEnum,
} from "@donecheck/report-ui";
import { defaultTemplate } from "@donecheck/templates";

const summaryStatuses = [
  "fulfilled",
  "partial",
  "insufficient-evidence",
  "unfulfilled",
  "suspicious-fake-implementation",
  "extra-scope",
] as const satisfies readonly (keyof JudgementReport["summaryStats"])[];

export function formatRulesJson(report: JudgementReport): string {
  const publicReport = {
    claimCoverage: report.claimCoverage,
    consolidatedRepairPrompt: {
      content: report.consolidatedRepairPrompt.content,
    },
    generatedAt: report.generatedAt,
    judgements: report.judgements.map((judgement) => ({
      confidence: judgement.confidence,
      certainty: translateEnum("confidenceLevel", judgement.confidenceLevel, "en"),
      evidenceRefs: judgement.evidenceRefs,
      explanation: judgement.explanation,
      itemType: translateEnum("kind", judgement.kind, "en"),
      status: translate(`status.${judgement.finalStatus}`, "en"),
    })),
    outcomeSummary: summaryStatuses.map((status) => ({
      count: report.summaryStats[status],
      status: translate(`status.${status}`, "en"),
    })),
    requirementCoverage: report.requirementCoverage,
    scopeDrift: report.scopeDrift,
    warnings: report.warnings,
  };

  return `${JSON.stringify(publicReport, null, 2)}\n`;
}

export function formatHtml(report: JudgementReport, locale: Locale = "en"): string {
  return createHtmlReportDocument({
    includeStyles: true,
    locale,
    report,
    template: defaultTemplate,
  });
}
