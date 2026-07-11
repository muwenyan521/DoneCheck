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

// Authoritative stage 4 report contracts are owned by `@donecheck/shared`.
// We re-export them from `@donecheck/report-ui` so the historical import
// path keeps compiling, and so any change to the report shape is detected
// at compile time across `core/rules` and `report-ui`. The rules engine
// imports the same schemas from shared, which means the moment a field is
// renamed or removed upstream, every consumer fails to typecheck.
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
:root{color:#172033;background:#eef3f8;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;padding:32px;background:linear-gradient(135deg,#eef3f8 0%,#f8fafc 48%,#e8f0ff 100%)}article[data-locale]{max-width:1120px;margin:0 auto;border:1px solid #d8e2ed;border-radius:28px;background:rgba(255,255,255,.96);box-shadow:0 24px 80px rgba(23,32,51,.12);padding:32px}header{border-bottom:1px solid #d8e2ed;margin-bottom:24px;padding-bottom:20px}h1{font-size:32px;letter-spacing:-.03em;margin:0 0 8px}h2{font-size:20px;margin:24px 0 12px}h3{font-size:16px;margin:0 0 8px}p,dd,li{line-height:1.6}section{margin:24px 0}dl{display:grid;grid-template-columns:minmax(160px,max-content) 1fr;gap:10px 18px;margin:0}dt{color:#526171;font-weight:800}dd{margin:0}ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;list-style:none;padding:0}li{border:1px solid #d8e2ed;border-radius:14px;background:#f8fafc;padding:10px 12px}article article{border:1px solid #d8e2ed;border-left:6px solid #1f6feb;border-radius:18px;background:#fff;margin:14px 0;padding:16px}article article[data-highlighted="true"]{border-left-color:#d97706;background:#fffbeb}article article[data-kind="extra-scope"]{border-left-color:#7c3aed}pre{white-space:pre-wrap;overflow:auto;border-radius:14px;background:#0f172a;color:#dbeafe;padding:14px}details{border:1px solid #d8e2ed;border-radius:16px;background:#f8fafc;margin:12px 0;padding:12px}summary{cursor:pointer;font-weight:800}@media (max-width:720px){body{padding:16px}article[data-locale]{padding:20px;border-radius:20px}dl{grid-template-columns:1fr}ul{grid-template-columns:1fr}}
</style>`;

const messages = {
  en: {
    common: {
      confidence: "Confidence",
      confidenceLevel: "Confidence Level",
      denominator: "Denominator",
      evidence: "Evidence",
      evidenceStrength: "Evidence strength",
      excludedInsufficientEvidence: "Excluded insufficient evidence",
      fakeImplementationSignals: "Fake implementation signals",
      generatedAt: "Generated at",
      kind: "Kind",
      rulesVersion: "Rules version",
      repairSuggestion: "Repair suggestion",
      signals: "Signals",
      sourceId: "Source ID",
      staticSignals: "Static recall signals",
      totalItems: "Total items",
      weightedFulfilled: "Weighted fulfilled",
    },
    reasonCode: {
      "extra-scope-detected": "Extra scope detected",
      "fake-implementation-signal-detected": "Fake implementation signal detected",
      "missing-semantic-draft": "Missing semantic draft",
      "semantic-fulfilled-with-incomplete-evidence": "Fulfilled with incomplete evidence",
      "semantic-fulfilled-with-strong-evidence": "Fulfilled with strong evidence",
      "semantic-partial-with-supporting-evidence": "Partially supported by evidence",
      "semantic-unsupported-without-static-support": "Unsupported without static evidence",
      "suspicious-without-confirmed-fake-signal": "Suspicious but no confirmed fake signal",
      "weak-or-unstable-evidence": "Weak or unstable evidence",
    },
    report: {
      claimCoverage: "Claim Coverage",
      debug: "Debug Details",
      empty: "No data available",
      judgements: "Judgements",
      overview: "Overview",
      requirementCoverage: "Requirement Coverage",
      riskHighlights: "Risk Highlights",
      semanticDraft: "Semantic Draft",
      scopeDrift: "Scope Drift",
      summaryStats: "Summary Stats",
      title: "DoneCheck Stage 5 Report",
      warnings: "Warnings",
    },
    status: {
      "extra-scope": "Extra Scope",
      fulfilled: "Fulfilled",
      "insufficient-evidence": "Insufficient Evidence",
      partial: "Partial",
      "suspicious-fake-implementation": "Suspicious Fake Implementation",
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
        description: "Highlights frontend-only and UI fake implementation risks early.",
        name: "Frontend Report",
      },
      generic: {
        description: "Balanced report layout for general DoneCheck reviews.",
        name: "Generic Report",
      },
      todo: {
        description: "Prioritizes actionable judgement details before risk grouping.",
        name: "TODO Report",
      },
    },
  },
  "zh-CN": {
    common: {
      confidence: "置信度",
      confidenceLevel: "置信等级",
      denominator: "分母",
      evidence: "证据",
      evidenceStrength: "证据强度",
      excludedInsufficientEvidence: "证据不足剔除",
      fakeImplementationSignals: "假实现信号",
      generatedAt: "生成时间",
      kind: "类型",
      rulesVersion: "规则版本",
      repairSuggestion: "修复建议",
      signals: "信号",
      sourceId: "来源 ID",
      staticSignals: "静态召回信号",
      totalItems: "总项数",
      weightedFulfilled: "加权兑现",
    },
    reasonCode: {
      "extra-scope-detected": "检测到需求外范围",
      "fake-implementation-signal-detected": "检测到假实现信号",
      "missing-semantic-draft": "缺少语义草案",
      "semantic-fulfilled-with-incomplete-evidence": "已兑现但证据不完整",
      "semantic-fulfilled-with-strong-evidence": "强证据支持已兑现",
      "semantic-partial-with-supporting-evidence": "部分证据支持部分兑现",
      "semantic-unsupported-without-static-support": "缺少静态证据支持",
      "suspicious-without-confirmed-fake-signal": "可疑但未确认假实现信号",
      "weak-or-unstable-evidence": "证据弱或不稳定",
    },
    report: {
      claimCoverage: "承诺覆盖率",
      debug: "调试信息",
      empty: "暂无数据",
      judgements: "判定列表",
      overview: "总览",
      requirementCoverage: "需求覆盖率",
      riskHighlights: "风险/亮点",
      semanticDraft: "语义草案",
      scopeDrift: "范围偏离",
      summaryStats: "状态统计",
      title: "DoneCheck 阶段 5 报告",
      warnings: "警告",
    },
    status: {
      "extra-scope": "需求外范围",
      fulfilled: "已兑现",
      "insufficient-evidence": "证据不足",
      partial: "部分兑现",
      "suspicious-fake-implementation": "疑似假实现",
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
        description: "优先突出前端 UI-only 与假实现风险。",
        name: "前端报告",
      },
      generic: {
        description: "适用于通用 DoneCheck 复核的均衡报告布局。",
        name: "通用报告",
      },
      todo: {
        description: "优先展示可行动的判定明细，再展示风险分组。",
        name: "TODO 报告",
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
    return locale === "zh-CN" ? `未知原因：${reasonCode}` : `Unknown reason: ${reasonCode}`;
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
  return (
    <article data-locale={locale} data-template-id={template.id}>
      <header>
        <h1>{translate("report.title", locale)}</h1>
        <h2>{translate(template.nameKey, locale)}</h2>
        <p>{translate(template.descriptionKey, locale)}</p>
      </header>
      {template.layout.sections.map((section) =>
        renderSection(section, { locale, report, template }),
      )}
    </article>
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
  return <DebugSection key={section} {...props} />;
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
        <dt>{translate("common.rulesVersion", locale)}</dt>
        <dd>{report.version}</dd>
        <dt>{translate("common.generatedAt", locale)}</dt>
        <dd>{report.generatedAt}</dd>
      </dl>
      <h3>{translate("report.summaryStats", locale)}</h3>
      <ul>
        {statusOrder.map((status) => (
          <li
            key={status}
          >{`${translate(`status.${status}`, locale)}: ${report.summaryStats[status]}`}</li>
        ))}
      </ul>
      {report.warnings.length > 0 ? (
        <p>{`${translate("report.warnings", locale)}: ${report.warnings.join("; ")}`}</p>
      ) : null}
    </section>
  );
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
      {risks.map((judgement) => (
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

function DebugSection({ locale, report, template }: JudgementReportPageProps) {
  const collapsed = template.layout.defaultCollapsedSections.includes("debug");
  return (
    <section aria-label={translate("report.debug", locale)} data-default-collapsed={collapsed}>
      <h2>{translate("report.debug", locale)}</h2>
      {report.judgements.map((judgement) => (
        <details key={judgement.id} open={!collapsed}>
          <summary>{`${judgement.sourceId} · ${translate(`status.${judgement.finalStatus}`, locale)}`}</summary>
          <h3>{translate("report.semanticDraft", locale)}</h3>
          <pre>{JSON.stringify(judgement.semanticDraft ?? null, null, 2)}</pre>
          <h3>{translate("common.signals", locale)}</h3>
          <dl>
            <dt>{translate("common.evidenceStrength", locale)}</dt>
            <dd>{translateEnum("evidenceStrength", judgement.signals.evidenceStrength, locale)}</dd>
            <dt>{translate("common.fakeImplementationSignals", locale)}</dt>
            <dd>
              <pre>{JSON.stringify(judgement.signals.fakeImplementationSignals, null, 2)}</pre>
            </dd>
            <dt>{translate("common.staticSignals", locale)}</dt>
            <dd>
              <pre>{JSON.stringify(judgement.signals.staticSignals, null, 2)}</pre>
            </dd>
          </dl>
        </details>
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
    <article data-highlighted={highlighted} data-kind={judgement.kind}>
      <h3>{`${translate(`status.${judgement.finalStatus}`, locale)} · ${judgement.sourceId}`}</h3>
      <p>{translateReasonCode(judgement.reasonCode, locale)}</p>
      <p>{judgement.explanation}</p>
      <dl>
        <dt>{translate("common.kind", locale)}</dt>
        <dd>{translateEnum("kind", judgement.kind, locale)}</dd>
        <dt>{translate("common.sourceId", locale)}</dt>
        <dd>{judgement.sourceId}</dd>
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
  return `${formatPercent(coverage.score)} · ${translate("common.denominator", locale)}: ${coverage.denominator} · ${translate("common.totalItems", locale)}: ${coverage.totalItems} · ${translate("common.weightedFulfilled", locale)}: ${coverage.weightedFulfilled} · ${translate("common.excludedInsufficientEvidence", locale)}: ${coverage.excludedInsufficientEvidence}`;
}

function formatEvidenceRef(ref: SemanticEvidenceRef): string {
  return `${ref.filePath}:${ref.lineStart}-${ref.lineEnd} ${ref.snippetSummary}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
