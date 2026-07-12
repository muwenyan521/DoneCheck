import type {
  CoverageResult,
  DoneCheckResult,
  FinalJudgement,
  FinalStatus,
  JudgementReport,
  ReportTemplate,
  ReportTemplateSection,
  SemanticEvidenceRef,
} from "@donecheck/shared";
import { renderToStaticMarkup } from "react-dom/server";

export type Locale = "en" | "zh-CN";

export type {
  ConfidenceLevel,
  CoverageResult,
  FinalJudgement,
  FinalJudgementKind,
  FinalStatus,
  JudgementReport,
  ReasonCode,
  ReportTemplate,
  ReportTemplateFinalStatus,
  ReportTemplateId,
  ReportTemplateReasonCode,
  ReportTemplateScenario,
  ReportTemplateSection,
  ScopeDrift,
  SemanticEvidenceRef,
  SemanticJudgementDraft,
  SummaryStats,
} from "@donecheck/shared";

export interface JudgementReportPageProps {
  readonly locale: Locale;
  readonly report: JudgementReport;
  readonly template: ReportTemplate;
}

export interface HtmlReportDocumentInput extends JudgementReportPageProps {
  readonly includeStyles?: boolean;
  readonly title?: string;
}

export const defaultReportStyles = `<style data-donecheck-report-styles="true">
:root{color:#172033;background:#eef3f8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;padding:32px;background:linear-gradient(135deg,#eef3f8 0%,#f8fafc 48%,#e8f0ff 100%)}article[data-locale]{max-width:1120px;margin:0 auto;border:1px solid #d8e2ed;border-radius:28px;background:rgba(255,255,255,.96);box-shadow:0 24px 80px rgba(23,32,51,.12);padding:32px}header{border-bottom:1px solid #d8e2ed;margin-bottom:24px;padding-bottom:20px}h1{font-size:32px;letter-spacing:0;margin:0 0 8px}h2{font-size:20px;margin:24px 0 12px}h3{font-size:16px;margin:0 0 8px}p,dd,li{line-height:1.6}section{margin:24px 0}dl{display:grid;grid-template-columns:minmax(160px,max-content) 1fr;gap:10px 18px;margin:0}dt{color:#526171;font-weight:800}dd{margin:0}ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;list-style:none;padding:0}li{border:1px solid #d8e2ed;border-radius:14px;background:#f8fafc;padding:10px 12px}article article{border:1px solid #d8e2ed;border-left:6px solid #1f6feb;border-radius:18px;background:#fff;margin:14px 0;padding:16px}article article[data-highlighted="true"]{border-left-color:#d97706;background:#fffbeb}article article[data-appearance="scope-warning"]{border-left-color:#7c3aed}pre{white-space:pre-wrap;overflow:auto;border-radius:14px;background:#0f172a;color:#dbeafe;padding:14px}details{border:1px solid #d8e2ed;border-radius:16px;background:#f8fafc;margin:12px 0;padding:12px}summary{cursor:pointer;font-weight:800}@media (max-width:720px){body{padding:16px}article[data-locale]{padding:20px;border-radius:20px}dl{grid-template-columns:1fr}ul{grid-template-columns:1fr}}
</style>`;

const messages = {
  en: {
    common: {
      confidence: "Confidence",
      confidenceLevel: "Certainty",
      assessedItems: "assessed",
      evidence: "Evidence",
      evidenceStrength: "Evidence strength",
      awaitingEvidence: "awaiting evidence",
      generatedAt: "Generated at",
      kind: "Kind",
      repairSuggestion: "Repair suggestion",
      totalItems: "total",
    },
    reasonCode: {
      "extra-scope-detected": "Extra scope detected",
      "fake-implementation-signal-detected": "Fake implementation signal detected",
      "missing-semantic-draft": "Not enough analysis evidence",
      "semantic-fulfilled-with-incomplete-evidence": "Fulfilled with incomplete evidence",
      "semantic-fulfilled-with-strong-evidence": "Fulfilled with strong evidence",
      "semantic-partial-with-supporting-evidence": "Partially supported by evidence",
      "semantic-unsupported-without-static-support": "Unsupported without static evidence",
      "suspicious-without-confirmed-fake-signal": "Suspicious but no confirmed fake signal",
      "weak-or-unstable-evidence": "Weak or unstable evidence",
    },
    report: {
      claimCoverage: "Confirmed Claims",
      details: "Details",
      empty: "No data available",
      judgements: "Findings",
      overview: "Overview",
      requirementCoverage: "Requirements Met",
      riskHighlights: "Priority Actions",
      consolidatedRepairPrompt: "Suggested Fix Instructions",
      consolidatedRepairPromptEmpty: "No combined fix instructions are available.",
      scopeDrift: "Work Outside the Request",
      summaryStats: "Outcome Summary",
      title: "DoneCheck Report",
      warnings: "Warnings",
    },
    status: {
      "extra-scope": "Extra Scope",
      fulfilled: "Fulfilled",
      "insufficient-evidence": "Insufficient Evidence",
      partial: "Partial",
      "suspicious-fake-implementation": "Appears Complete Without Working Evidence",
      unfulfilled: "Unfulfilled",
    },
    kind: {
      claim: "Claim",
      "extra-scope": "Extra Scope",
      requirement: "Requirement",
    },
    confidenceLevel: {
      high: "High",
      low: "Low",
      medium: "Medium",
    },
    evidenceStrength: {
      medium: "Medium",
      none: "None",
      strong: "Strong",
      weak: "Weak",
    },
    scopeDriftLevel: {
      high: "High",
      low: "Low",
      medium: "Medium",
    },
    template: {
      frontend: {
        description: "Focuses on interface implementation and completion risks.",
        name: "Frontend Report",
      },
      generic: {
        description: "Balanced report layout for general DoneCheck reviews.",
        name: "Standard Report",
      },
      todo: {
        description: "Prioritizes actionable judgement details before risk grouping.",
        name: "Task-list Report",
      },
    },
  },
  "zh-CN": {
    common: {
      confidence: "置信度",
      confidenceLevel: "可信程度",
      assessedItems: "已评估",
      evidence: "证据",
      evidenceStrength: "证据强度",
      awaitingEvidence: "待补充证据",
      generatedAt: "生成时间",
      kind: "类型",
      repairSuggestion: "修复建议",
      totalItems: "共",
    },
    reasonCode: {
      "extra-scope-detected": "检测到需求外范围",
      "fake-implementation-signal-detected": "检测到假实现信号",
      "missing-semantic-draft": "没有足够的分析证据",
      "semantic-fulfilled-with-incomplete-evidence": "已兑现但证据不完整",
      "semantic-fulfilled-with-strong-evidence": "强证据支持已兑现",
      "semantic-partial-with-supporting-evidence": "部分证据支持部分兑现",
      "semantic-unsupported-without-static-support": "缺少静态证据支持",
      "suspicious-without-confirmed-fake-signal": "可疑但未确认假实现信号",
      "weak-or-unstable-evidence": "证据弱或不稳定",
    },
    report: {
      claimCoverage: "已确认承诺",
      details: "详细信息",
      empty: "暂无数据",
      judgements: "检查结果",
      overview: "总览",
      requirementCoverage: "需求达成情况",
      riskHighlights: "优先处理",
      consolidatedRepairPrompt: "建议修复说明",
      consolidatedRepairPromptEmpty: "暂无可用的汇总修复说明。",
      scopeDrift: "需求之外的改动",
      summaryStats: "结果汇总",
      title: "DoneCheck 分析报告",
      warnings: "警告",
    },
    status: {
      "extra-scope": "需求外范围",
      fulfilled: "已兑现",
      "insufficient-evidence": "证据不足",
      partial: "部分兑现",
      "suspicious-fake-implementation": "看似完成但缺少可运行证据",
      unfulfilled: "未兑现",
    },
    kind: {
      claim: "承诺",
      "extra-scope": "需求外范围",
      requirement: "需求",
    },
    confidenceLevel: {
      high: "高",
      low: "低",
      medium: "中",
    },
    evidenceStrength: {
      medium: "中",
      none: "无",
      strong: "强",
      weak: "弱",
    },
    scopeDriftLevel: {
      high: "高",
      low: "低",
      medium: "中",
    },
    template: {
      frontend: {
        description: "优先关注界面实现与完成度风险。",
        name: "前端报告",
      },
      generic: {
        description: "适用于通用 DoneCheck 复核的均衡报告布局。",
        name: "通用报告",
      },
      todo: {
        description: "优先展示可行动的判定明细，再展示风险分组。",
        name: "任务清单报告",
      },
    },
  },
} as const;

export interface ReportSummaryProps {
  readonly result: DoneCheckResult;
}

export function ReportSummary({ result }: ReportSummaryProps) {
  return (
    <section aria-label="DoneCheck report summary">
      <strong>{result.status === "pass" ? "Passed" : "Needs work"}</strong>
      <p>{result.summary}</p>
      <time dateTime={result.checkedAt}>{result.checkedAt}</time>
    </section>
  );
}

export function translate(key: string, locale: Locale): string {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, messages[locale]);
  return typeof value === "string" ? value : key;
}

export function translateReasonCode(reasonCode: string, locale: Locale): string {
  const value = translate(`reasonCode.${reasonCode}`, locale);
  if (value === `reasonCode.${reasonCode}`) {
    return locale === "zh-CN" ? "暂时无法确定原因" : "The reason could not be determined";
  }
  return value;
}

export function translateEnum(
  category: "kind" | "confidenceLevel" | "evidenceStrength" | "scopeDriftLevel",
  value: string,
  locale: Locale,
): string {
  const translated = translate(`${category}.${value}`, locale);
  return translated === `${category}.${value}` ? value : translated;
}

export function JudgementReportPage({ locale, report, template }: JudgementReportPageProps) {
  const leadingSections = template.layout.sections.filter(
    (section) => section === "overview" || section === "risk-highlights",
  );
  const detailSections = template.layout.sections.filter(
    (section) => section !== "overview" && section !== "risk-highlights",
  );
  return (
    <article data-locale={locale}>
      <header>
        <h1>{translate("report.title", locale)}</h1>
        <h2>{translate(template.nameKey, locale)}</h2>
      </header>
      {leadingSections.map((section) => renderSection(section, { locale, report, template }))}
      <ConsolidatedRepairPromptSection locale={locale} report={report} />
      {detailSections.map((section) => renderSection(section, { locale, report, template }))}
    </article>
  );
}

function ConsolidatedRepairPromptSection({
  locale,
  report,
}: Pick<JudgementReportPageProps, "locale" | "report">) {
  const content = report.consolidatedRepairPrompt.content[locale];
  return (
    <section
      aria-label={translate("report.consolidatedRepairPrompt", locale)}
      className="consolidated-repair-prompt"
    >
      <h2>{translate("report.consolidatedRepairPrompt", locale)}</h2>
      {content.trim().length === 0 ? (
        <p>{translate("report.consolidatedRepairPromptEmpty", locale)}</p>
      ) : (
        <pre>{content}</pre>
      )}
    </section>
  );
}

export function createHtmlReportDocument({
  locale,
  report,
  template,
  title,
  includeStyles,
}: HtmlReportDocumentInput): string {
  const markup = renderToStaticMarkup(
    <JudgementReportPage locale={locale} report={report} template={template} />,
  );
  const styles = includeStyles === true ? defaultReportStyles : "";
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${escapeHtml(title ?? translate("report.title", locale))}</title>${styles}</head><body>${markup}</body></html>`;
}

function renderSection(section: ReportTemplateSection, props: JudgementReportPageProps) {
  if (section === "overview") {
    return <OverviewSection key={section} {...props} />;
  }
  if (section === "risk-highlights") {
    return <RiskHighlightsSection key={section} {...props} />;
  }
  if (section === "judgements") {
    return <JudgementsSection key={section} {...props} />;
  }
  return null;
}

function OverviewSection({ locale, report }: JudgementReportPageProps) {
  return (
    <section aria-label={translate("report.overview", locale)}>
      <h2>{translate("report.overview", locale)}</h2>
      <dl>
        <dt>{translate("report.requirementCoverage", locale)}</dt>
        <dd>{formatCoverage(report.requirementCoverage, locale)}</dd>
        <dt>{translate("report.claimCoverage", locale)}</dt>
        <dd>{formatCoverage(report.claimCoverage, locale)}</dd>
        <dt>{translate("report.scopeDrift", locale)}</dt>
        <dd>{`${formatPercent(report.scopeDrift.score)} · ${translateEnum("scopeDriftLevel", report.scopeDrift.level, locale)}`}</dd>
        <dt>{translate("common.generatedAt", locale)}</dt>
        <dd>
          <time dateTime={report.generatedAt}>{formatDate(report.generatedAt, locale)}</time>
        </dd>
      </dl>
      <h3>{translate("report.summaryStats", locale)}</h3>
      <ul className="summary-stats">
        {statusOrder.map((status) => (
          <li
            key={status}
          >{`${translate(`status.${status}`, locale)}: ${report.summaryStats[status]}`}</li>
        ))}
      </ul>
      {report.warnings.length > 0 ? (
        <p>{`${translate("report.warnings", locale)}: ${formatWarnings(report.warnings, locale).join("; ")}`}</p>
      ) : null}
    </section>
  );
}

function formatWarnings(warnings: readonly string[], locale: Locale): readonly string[] {
  if (locale === "en") return warnings;
  const localizedWarnings: Readonly<Record<string, string>> = {
    "Some items rely only on weak static evidence.": "部分项目目前只有较弱的静态证据。",
    "Some items still need more evidence before they can be assessed.":
      "部分项目仍需补充证据后才能评估。",
  };
  return warnings.map((warning) => localizedWarnings[warning] ?? warning);
}

function RiskHighlightsSection({ locale, report, template }: JudgementReportPageProps) {
  const highlightStatuses = new Set(template.highlights.statuses);
  const highlightReasonCodes = new Set(template.highlights.reasonCodes);
  const risks = report.judgements.filter(
    (judgement) =>
      highlightStatuses.has(judgement.finalStatus) ||
      highlightReasonCodes.has(judgement.reasonCode),
  );
  return (
    <section aria-label={translate("report.riskHighlights", locale)}>
      <h2>{translate("report.riskHighlights", locale)}</h2>
      {risks.length === 0 ? <p>{translate("report.empty", locale)}</p> : null}
      <ol>
        {risks.map((judgement) => (
          <li key={judgement.id}>
            <strong>{translate(`status.${judgement.finalStatus}`, locale)}</strong>
            <p>{judgement.explanation}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function JudgementsSection({ locale, report, template }: JudgementReportPageProps) {
  return (
    <section aria-label={translate("report.judgements", locale)}>
      <h2>{translate("report.judgements", locale)}</h2>
      {report.judgements.map((judgement) => (
        <JudgementCard
          judgement={judgement}
          key={judgement.id}
          locale={locale}
          template={template}
        />
      ))}
    </section>
  );
}

function JudgementCard({
  judgement,
  locale,
  template,
}: {
  readonly judgement: FinalJudgement;
  readonly locale: Locale;
  readonly template: ReportTemplate;
}) {
  const highlighted =
    template.highlights.statuses.includes(judgement.finalStatus) ||
    template.highlights.reasonCodes.includes(judgement.reasonCode);
  return (
    <article
      data-appearance={judgement.kind === "extra-scope" ? "scope-warning" : undefined}
      data-highlighted={highlighted}
    >
      <h3>{translate(`status.${judgement.finalStatus}`, locale)}</h3>
      <p>{judgement.explanation}</p>
      <details>
        <summary>{translate("report.details", locale)}</summary>
        <dl>
          <dt>{translate("common.kind", locale)}</dt>
          <dd>{translateEnum("kind", judgement.kind, locale)}</dd>
          <dt>{translate("common.confidence", locale)}</dt>
          <dd>{formatPercent(judgement.confidence)}</dd>
          <dt>{translate("common.confidenceLevel", locale)}</dt>
          <dd>{translateEnum("confidenceLevel", judgement.confidenceLevel, locale)}</dd>
          <dt>{translate("common.evidence", locale)}</dt>
          <dd>
            {judgement.evidenceRefs.length === 0
              ? translate("report.empty", locale)
              : judgement.evidenceRefs.map(formatEvidenceRef).join("; ")}
          </dd>
          {judgement.semanticDraft?.repairSuggestion ? (
            <>
              <dt>{translate("common.repairSuggestion", locale)}</dt>
              <dd>{judgement.semanticDraft.repairSuggestion}</dd>
            </>
          ) : null}
        </dl>
      </details>
    </article>
  );
}

const statusOrder: readonly FinalStatus[] = [
  "fulfilled",
  "partial",
  "insufficient-evidence",
  "unfulfilled",
  "suspicious-fake-implementation",
  "extra-scope",
];

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatCoverage(coverage: CoverageResult, locale: Locale): string {
  const assessed = coverage.denominator;
  const total = coverage.totalItems;
  const awaitingEvidence = coverage.excludedInsufficientEvidence;
  if (locale === "zh-CN") {
    const awaiting =
      awaitingEvidence > 0
        ? ` · ${awaitingEvidence} 项${translate("common.awaitingEvidence", locale)}`
        : "";
    return `${formatPercent(coverage.score)} · ${translate("common.assessedItems", locale)} ${assessed} 项 · ${translate("common.totalItems", locale)} ${total} 项${awaiting}`;
  }
  const awaiting =
    awaitingEvidence > 0
      ? ` · ${awaitingEvidence} ${translate("common.awaitingEvidence", locale)}`
      : "";
  return `${formatPercent(coverage.score)} · ${assessed} ${assessed === 1 ? "item" : "items"} ${translate("common.assessedItems", locale)} · ${total} ${total === 1 ? "item" : "items"} ${translate("common.totalItems", locale)}${awaiting}`;
}

function formatEvidenceRef(ref: SemanticEvidenceRef): string {
  return `${ref.filePath}:${ref.lineStart}-${ref.lineEnd} ${ref.snippetSummary}`;
}

function formatDate(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
