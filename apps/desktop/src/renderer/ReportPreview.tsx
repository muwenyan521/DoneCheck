import { JudgementReportPage } from "@donecheck/report-ui";
import { getTemplateById } from "@donecheck/templates";
import type { JudgementReport, Locale, ReportTemplateId } from "../ipc-contract.js";

export interface ReportPreviewProps {
  readonly locale: Locale;
  readonly report: JudgementReport;
  readonly templateId: ReportTemplateId;
}

export function ReportPreview({ locale, report, templateId }: ReportPreviewProps) {
  const template = getTemplateById(templateId) ?? getTemplateById("generic");
  if (template === undefined) {
    throw new Error("Missing generic report template");
  }
  return <JudgementReportPage locale={locale} report={report} template={template} />;
}
