import type { JudgementReport } from "@donecheck/core";
import { type Locale, createHtmlReportDocument } from "@donecheck/report-ui";
import { defaultTemplate } from "@donecheck/templates";

export function formatRulesJson(report: JudgementReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function formatHtml(report: JudgementReport, locale: Locale = "en"): string {
  return createHtmlReportDocument({
    includeStyles: true,
    locale,
    report,
    template: defaultTemplate,
  });
}
