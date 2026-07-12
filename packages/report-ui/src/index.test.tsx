import { buildJudgementReport } from "@donecheck/core/rules";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  type FinalJudgement,
  type JudgementReport,
  JudgementReportPage,
  ReportSummary,
  type ReportTemplate,
  createHtmlReportDocument,
  translateReasonCode,
} from "./index.js";

const evidenceRef = {
  filePath: "src/auth/session.ts",
  lineEnd: 12,
  lineStart: 10,
  snippetSummary: "Persists auth token in localStorage.",
};

const report: JudgementReport = {
  claimCoverage: {
    denominator: 2,
    excludedInsufficientEvidence: 0,
    score: 0.25,
    totalItems: 2,
    weightedFulfilled: 0.5,
  },
  consolidatedRepairPrompt: {
    content: { "zh-CN": "修复未兑现项。", en: "Repair unfulfilled items." },
    includedJudgementIds: ["requirement:req-partial"],
    version: "repair-v1",
  },
  generatedAt: "2026-06-27T00:00:00.000Z",
  judgements: [
    {
      confidence: 0.95,
      confidenceLevel: "high",
      evidenceRefs: [evidenceRef],
      explanation: "Auth persistence is implemented.",
      finalStatus: "fulfilled",
      id: "requirement:req-fulfilled",
      kind: "requirement",
      reasonCode: "semantic-fulfilled-with-strong-evidence",
      semanticDraft: {
        confidence: 0.95,
        evidenceRefs: [evidenceRef],
        explanation: "Auth persistence is implemented.",
        judgementDraft: "fulfilled",
        matchedRequirementId: "req-fulfilled",
        repairSuggestion: "No repair needed.",
      },
      signals: {
        evidenceStrength: "strong",
        fakeImplementationSignals: [],
        staticSignals: [
          { filePath: "src/auth/session.ts", keyword: "localStorage", strength: "strong" },
        ],
      },
      sourceId: "req-fulfilled",
    },
    {
      confidence: 0.7,
      confidenceLevel: "medium",
      evidenceRefs: [evidenceRef],
      explanation: "Profile form has partial validation.",
      finalStatus: "partial",
      id: "requirement:req-partial",
      kind: "requirement",
      reasonCode: "semantic-partial-with-supporting-evidence",
      signals: { evidenceStrength: "medium", fakeImplementationSignals: [], staticSignals: [] },
      sourceId: "req-partial",
    },
    {
      confidence: 0.2,
      confidenceLevel: "low",
      evidenceRefs: [],
      explanation: "No stable implementation evidence was found.",
      finalStatus: "insufficient-evidence",
      id: "requirement:req-insufficient",
      kind: "requirement",
      reasonCode: "missing-semantic-draft",
      signals: { evidenceStrength: "none", fakeImplementationSignals: [], staticSignals: [] },
      sourceId: "req-insufficient",
    },
    {
      confidence: 0.9,
      confidenceLevel: "high",
      evidenceRefs: [evidenceRef],
      explanation: "Logout is not implemented.",
      finalStatus: "unfulfilled",
      id: "claim:claim-unfulfilled",
      kind: "claim",
      reasonCode: "semantic-unsupported-without-static-support",
      signals: { evidenceStrength: "none", fakeImplementationSignals: [], staticSignals: [] },
      sourceId: "claim-unfulfilled",
    },
    {
      confidence: 0.85,
      confidenceLevel: "high",
      evidenceRefs: [evidenceRef],
      explanation: "The logout claim is wired to an empty handler.",
      finalStatus: "suspicious-fake-implementation",
      id: "claim:claim-fake",
      kind: "claim",
      reasonCode: "fake-implementation-signal-detected",
      signals: {
        evidenceStrength: "medium",
        fakeImplementationSignals: [
          {
            filePath: "src/logout.tsx",
            lineEnd: 42,
            lineStart: 42,
            pattern: "empty-handler",
            strength: "strong",
            targetId: "claim-fake",
            targetKind: "claim",
          },
        ],
        staticSignals: [{ filePath: "src/logout.tsx", keyword: "onClick", strength: "medium" }],
      },
      sourceId: "claim-fake",
    },
    {
      confidence: 1,
      confidenceLevel: "high",
      evidenceRefs: [evidenceRef],
      explanation: "Adds an unrelated admin dashboard.",
      finalStatus: "extra-scope",
      id: "extra:extra-admin",
      kind: "extra-scope",
      reasonCode: "extra-scope-detected",
      signals: { evidenceStrength: "strong", fakeImplementationSignals: [], staticSignals: [] },
      sourceId: "extra-admin",
    },
  ],
  requirementCoverage: {
    denominator: 2,
    excludedInsufficientEvidence: 1,
    score: 0.75,
    totalItems: 3,
    weightedFulfilled: 1.5,
  },
  scopeDrift: { extraScopeCount: 1, level: "medium", score: 0.17 },
  summaryStats: {
    "extra-scope": 1,
    fulfilled: 1,
    "insufficient-evidence": 1,
    partial: 1,
    "suspicious-fake-implementation": 1,
    unfulfilled: 1,
  },
  version: "rules-v1",
  warnings: ["Some items still need more evidence before they can be assessed."],
};

const genericTemplate: ReportTemplate = {
  descriptionKey: "template.generic.description",
  highlights: {
    reasonCodes: [
      "fake-implementation-signal-detected",
      "extra-scope-detected",
      "missing-semantic-draft",
    ],
    statuses: ["suspicious-fake-implementation", "extra-scope", "insufficient-evidence"],
  },
  id: "generic",
  layout: {
    defaultCollapsedSections: [],
    sections: ["overview", "risk-highlights", "judgements"],
  },
  nameKey: "template.generic.name",
  scenarios: ["generic"],
};

const todoTemplate: ReportTemplate = {
  ...genericTemplate,
  descriptionKey: "template.todo.description",
  highlights: {
    reasonCodes: [
      "missing-semantic-draft",
      "weak-or-unstable-evidence",
      "semantic-partial-with-supporting-evidence",
    ],
    statuses: ["insufficient-evidence", "partial", "unfulfilled"],
  },
  id: "todo",
  layout: {
    defaultCollapsedSections: [],
    sections: ["overview", "judgements", "risk-highlights"],
  },
  nameKey: "template.todo.name",
  scenarios: ["todo"],
};

const frontendTemplate: ReportTemplate = {
  ...genericTemplate,
  descriptionKey: "template.frontend.description",
  highlights: {
    reasonCodes: ["fake-implementation-signal-detected", "extra-scope-detected"],
    statuses: ["suspicious-fake-implementation", "extra-scope"],
  },
  id: "frontend",
  layout: {
    defaultCollapsedSections: [],
    sections: ["overview", "risk-highlights", "judgements"],
  },
  nameKey: "template.frontend.name",
  scenarios: ["frontend"],
};

function html(template = genericTemplate, locale: "zh-CN" | "en" = "zh-CN") {
  return renderToStaticMarkup(
    <JudgementReportPage locale={locale} report={report} template={template} />,
  );
}

describe("JudgementReportPage", () => {
  it("renders a complete user-facing report without internal metadata", () => {
    const markup = html();

    expect(markup).toContain("DoneCheck 分析报告");
    expect(markup).toContain("需求达成情况");
    expect(markup).toContain("75%");
    expect(markup).toContain("已确认承诺");
    expect(markup).toContain("25%");
    expect(markup).toContain("需求之外的改动");
    expect(markup).toContain("17% · 中");
    expect(markup).toContain("75% · 已评估 2 项 · 共 3 项 · 1 项待补充证据");
    expect(markup).not.toContain("适用于通用 DoneCheck 复核的均衡报告布局。");
    expect(markup).toContain('dateTime="2026-06-27T00:00:00.000Z"');
    for (const label of [
      "已兑现",
      "部分兑现",
      "证据不足",
      "未兑现",
      "看似完成但缺少可运行证据",
      "需求外范围",
    ]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("看似完成但缺少可运行证据");
    expect(markup).toContain("需求外范围");
    expect(markup).toContain("证据不足");
    expect(markup).toContain("类型");
    expect(markup).toContain("需求");
    for (const internalTerm of ["阶段", "rules-v1", "语义草案", "假实现信号", "静态召回信号"]) {
      expect(markup).not.toContain(internalTerm);
    }
    for (const internalId of report.judgements.map((judgement) => judgement.sourceId)) {
      expect(markup).not.toContain(internalId);
    }
    for (const internalSlug of [
      "insufficient-evidence",
      "suspicious-fake-implementation",
      "extra-scope",
    ]) {
      expect(markup).not.toContain(internalSlug);
    }
  });

  it("switches zh-CN and en user-visible copy for the same report", () => {
    const zh = html(genericTemplate, "zh-CN");
    const en = html(genericTemplate, "en");

    expect(zh).toContain("DoneCheck 分析报告");
    expect(zh).toContain("看似完成但缺少可运行证据");
    expect(en).toContain("DoneCheck Report");
    expect(en).toContain("Appears Complete Without Working Evidence");
    expect(en).toContain("Certainty");
    for (const internalTerm of [
      "Stage",
      "rules-v1",
      "Semantic Draft",
      "Static recall signals",
      "Fake implementation signals",
      "Source ID",
    ]) {
      expect(en).not.toContain(internalTerm);
    }
  });

  it("translates missing analysis evidence without exposing internal terminology", () => {
    expect(translateReasonCode("missing-semantic-draft", "zh-CN")).toBe("没有足够的分析证据");
    expect(translateReasonCode("missing-semantic-draft", "en")).toBe(
      "Not enough analysis evidence",
    );
  });

  it("renders the consolidated repair prompt directly from the localized report field in desktop and static HTML output", () => {
    const zh = html(genericTemplate, "zh-CN");
    const en = html(genericTemplate, "en");
    const document = createHtmlReportDocument({ locale: "en", report, template: genericTemplate });

    expect(zh).toContain("建议修复说明");
    expect(zh).toContain("修复未兑现项。");
    expect(en).toContain("Suggested Fix Instructions");
    expect(en).toContain("Repair unfulfilled items.");
    expect(document).toContain("Suggested Fix Instructions");
    expect(document).toContain("Repair unfulfilled items.");
    expect(en.indexOf("Overview")).toBeLessThan(en.indexOf("Suggested Fix Instructions"));
    expect(en.indexOf("Priority Actions")).toBeLessThan(en.indexOf("Suggested Fix Instructions"));
  });

  it("renders an explicit localized empty state when the consolidated repair prompt content is empty", () => {
    const reportWithoutPrompt: JudgementReport = {
      ...report,
      consolidatedRepairPrompt: {
        ...report.consolidatedRepairPrompt,
        content: { "zh-CN": "", en: "" },
      },
    };

    expect(
      renderToStaticMarkup(
        <JudgementReportPage locale="en" report={reportWithoutPrompt} template={genericTemplate} />,
      ),
    ).toContain("No combined fix instructions are available.");
    expect(
      renderToStaticMarkup(
        <JudgementReportPage
          locale="zh-CN"
          report={reportWithoutPrompt}
          template={genericTemplate}
        />,
      ),
    ).toContain("暂无可用的汇总修复说明。");
  });

  it("renders semantic repair suggestions visibly in zh-CN and en judgement cards", () => {
    const zh = html(genericTemplate, "zh-CN");
    const en = html(genericTemplate, "en");

    expect(zh).toContain("修复建议");
    expect(zh).toContain("No repair needed.");
    expect(en).toContain("Repair suggestion");
    expect(en).toContain("No repair needed.");
  });

  it("does not expose reason codes in the report", () => {
    const markup = html(genericTemplate, "en");

    expect(markup).not.toContain("Fake implementation signal detected");
    expect(markup).not.toContain("Extra scope detected");
    expect(markup).not.toContain("fake-implementation-signal-detected");
    expect(markup).not.toContain("extra-scope-detected");
  });

  it("falls back safely for unknown reasonCode and missing translation keys", () => {
    expect(translateReasonCode("unknown-code", "en")).toBe("The reason could not be determined");
    const firstJudgement = report.judgements[0] as FinalJudgement;
    // Cast through `unknown` because we are deliberately feeding an invalid
    // reasonCode to assert the runtime fallback. The strict shared
    // `ReasonCode` enum normally forbids this — that compile-time safety is
    // exactly what we want; this test bypasses it on purpose.
    const brokenJudgement = {
      ...firstJudgement,
      reasonCode: "unknown-code",
    } as unknown as FinalJudgement;
    const markup = renderToStaticMarkup(
      <JudgementReportPage
        locale="en"
        report={{
          ...report,
          judgements: [brokenJudgement],
        }}
        template={{ ...genericTemplate, nameKey: "template.missing.name" }}
      />,
    );

    expect(markup).not.toContain("unknown-code");
    expect(markup).toContain("template.missing.name");
  });

  it("localizes the user-visible item types, confidence, and scope level", () => {
    const zh = html(genericTemplate, "zh-CN");
    const en = html(genericTemplate, "en");

    expect(zh).toContain("需求");
    expect(zh).toContain("承诺");
    expect(zh).toContain("高");
    expect(en).toContain("Requirement");
    expect(en).toContain("Claim");
    expect(en).toContain("High");
  });

  it("uses template configuration to change section order and highlighted items without mutating report data", () => {
    const before = JSON.stringify(report);
    const generic = html(genericTemplate, "en");
    const todo = html(todoTemplate, "en");
    const frontend = html(frontendTemplate, "en");

    expect(generic.indexOf("Priority Actions")).toBeLessThan(generic.indexOf("Findings"));
    expect(todo.indexOf("Priority Actions")).toBeLessThan(todo.indexOf("Findings"));
    expect(frontend).not.toContain("Debug Details");
    expect(generic).toContain('data-highlighted="true"');
    expect(JSON.stringify(report)).toBe(before);
  });

  it("drives RiskHighlightsSection from template.highlights instead of a fixed status list", () => {
    const generic = html(genericTemplate, "en");
    const todo = html(todoTemplate, "en");

    const riskSection = (markup: string) => {
      const start = markup.indexOf("Priority Actions");
      const findingsIdx = markup.indexOf("Findings", start + 1);
      const candidates = [findingsIdx].filter((idx) => idx !== -1);
      const end = candidates.length > 0 ? Math.min(...candidates) : markup.length;
      return markup.slice(start, end);
    };

    const genericRisk = riskSection(generic);
    const todoRisk = riskSection(todo);

    expect(genericRisk).toContain("Appears Complete Without Working Evidence");
    expect(genericRisk).toContain("Extra Scope");
    expect(genericRisk).not.toContain("Partial");

    expect(todoRisk).toContain("Partial");
    expect(todoRisk).toContain("Unfulfilled");
    expect(todoRisk).not.toContain("Appears Complete Without Working Evidence");
  });

  it("keeps ReportSummary as a compatibility wrapper for legacy DoneCheckResult", () => {
    const markup = renderToStaticMarkup(
      <ReportSummary
        result={{
          checkedAt: "2026-06-26T00:00:00.000Z",
          checkResults: [
            {
              checkId: "evidence-present",
              message: "Evidence text is present.",
              score: 1,
              status: "pass",
            },
          ],
          score: 1,
          status: "pass",
          summary: "Evidence found.",
        }}
      />,
    );

    expect(markup).toContain("Passed");
    expect(markup).toContain("Evidence found.");
  });
});

describe("createHtmlReportDocument", () => {
  it("creates a self-contained HTML document entry that can host the report page", () => {
    const document = createHtmlReportDocument({ locale: "en", report, template: genericTemplate });

    expect(document).toContain("<!doctype html>");
    expect(document).toContain('<html lang="en">');
    expect(document).toContain("DoneCheck Report");
    expect(document).not.toContain("Stage");
    expect(document).not.toContain("rules-v1");
    expect(document).not.toContain("Fake implementation signal detected");
    expect(document).not.toContain("Source ID");
    expect(document).not.toMatch(/letter-spacing:\s*-/u);
    for (const internalSlug of [
      "insufficient-evidence",
      "suspicious-fake-implementation",
      "extra-scope",
    ]) {
      expect(document).not.toContain(internalSlug);
    }
    for (const internalId of report.judgements.map((judgement) => judgement.sourceId)) {
      expect(document).not.toContain(internalId);
    }
  });
});

describe("integration with @donecheck/core/rules", () => {
  // This test guards against silent contract drift between the rules engine
  // and the report UI. It builds a real JudgementReport via
  // `buildJudgementReport()` and feeds it straight into `JudgementReportPage`.
  // If core/rules ever changes the report shape in a way report-ui can no
  // longer consume, this test fails instead of silently shipping a broken UI.
  it("renders a real buildJudgementReport() output without reshaping or hand-copying fields", () => {
    const realReport = buildJudgementReport({
      claims: [{ id: "claim-logout", text: "Logout handler is wired." }],
      extraScopeCandidates: [
        {
          evidenceRefs: [
            {
              filePath: "src/admin/dashboard.tsx",
              lineEnd: 30,
              lineStart: 1,
              snippetSummary: "Adds an unrelated admin dashboard.",
            },
          ],
          id: "extra-admin",
          sourceId: "extra-admin",
          summary: "Adds an unrelated admin dashboard.",
        },
      ],
      fakeImplementationSignals: [
        {
          filePath: "src/logout.tsx",
          lineEnd: 42,
          lineStart: 42,
          pattern: "empty-handler",
          strength: "strong",
          targetId: "claim-logout",
          targetKind: "claim",
        },
      ],
      generatedAt: "2026-06-27T00:00:00.000Z",
      requirements: [
        { id: "req-auth", text: "Auth token persistence." },
        { id: "req-profile", text: "Profile form validation." },
      ],
      semanticDrafts: [
        {
          confidence: 0.95,
          evidenceRefs: [
            {
              filePath: "src/auth/session.ts",
              lineEnd: 12,
              lineStart: 10,
              snippetSummary: "Persists auth token in localStorage.",
            },
          ],
          explanation: "Auth persistence is implemented.",
          judgementDraft: "fulfilled",
          matchedRequirementId: "req-auth",
          repairSuggestion: "No repair needed.",
        },
        {
          confidence: 0.4,
          evidenceRefs: [
            {
              filePath: "src/profile/form.tsx",
              lineEnd: 25,
              lineStart: 10,
              snippetSummary: "Partial validation only.",
            },
          ],
          explanation: "Profile form has partial validation.",
          judgementDraft: "unsupported",
          matchedRequirementId: "req-profile",
          repairSuggestion: "Add full server-side validation.",
        },
      ],
      staticSignals: [
        {
          filePath: "src/auth/session.ts",
          keyword: "localStorage",
          strength: "strong",
          targetId: "req-auth",
          targetKind: "requirement",
        },
      ],
    });

    // Sanity: the report must have been produced by the real engine.
    expect(realReport.version).toBe("rules-v1");
    expect(realReport.judgements.length).toBe(4);

    const markup = renderToStaticMarkup(
      <JudgementReportPage locale="en" report={realReport} template={genericTemplate} />,
    );

    expect(markup).not.toContain("rules-v1");
    expect(markup).toContain("2026-06-27T00:00:00.000Z");

    // Every finalStatus that the engine can emit must be rendered using the
    // shared status dictionary. This proves report-ui and core/rules agree
    // on the enum surface.
    for (const label of [
      "Fulfilled",
      "Insufficient Evidence",
      "Unfulfilled",
      "Appears Complete Without Working Evidence",
      "Extra Scope",
    ]) {
      expect(markup).toContain(label);
    }

    expect(markup).not.toContain("fake-implementation-signal-detected");
    expect(markup).not.toContain("extra-scope-detected");
    for (const judgement of realReport.judgements) {
      expect(markup).not.toContain(judgement.sourceId);
    }

    // The real `buildExplanation` strings must survive into the DOM. If
    // core/rules ever changes its explanation format, this assertion keeps
    // report-ui honest about rendering whatever the engine produced.
    for (const judgement of realReport.judgements) {
      expect(markup).toContain(judgement.explanation);
    }

    // Coverage scores computed by the real engine must appear verbatim.
    expect(markup).toContain(`${Math.round(realReport.requirementCoverage.score * 100)}%`);
    expect(markup).toContain(`${Math.round(realReport.claimCoverage.score * 100)}%`);
  });

  it("renders the same real-report output in zh-CN using the shared Chinese dictionary", () => {
    const realReport = buildJudgementReport({
      claims: [{ id: "claim-logout", text: "Logout handler is wired." }],
      extraScopeCandidates: [],
      fakeImplementationSignals: [],
      generatedAt: "2026-06-27T00:00:00.000Z",
      requirements: [{ id: "req-auth", text: "Auth token persistence." }],
      semanticDrafts: [
        {
          confidence: 0.95,
          evidenceRefs: [
            {
              filePath: "src/auth/session.ts",
              lineEnd: 12,
              lineStart: 10,
              snippetSummary: "Persists auth token in localStorage.",
            },
          ],
          explanation: "Auth persistence is implemented.",
          judgementDraft: "fulfilled",
          matchedRequirementId: "req-auth",
          repairSuggestion: "No repair needed.",
        },
      ],
      staticSignals: [
        {
          filePath: "src/auth/session.ts",
          keyword: "localStorage",
          strength: "strong",
          targetId: "req-auth",
          targetKind: "requirement",
        },
      ],
    });

    const markup = renderToStaticMarkup(
      <JudgementReportPage locale="zh-CN" report={realReport} template={genericTemplate} />,
    );

    expect(markup).toContain("DoneCheck 分析报告");
    expect(markup).toContain("已兑现");
    expect(markup).not.toContain("rules-v1");
    expect(markup).not.toContain("阶段");
  });
});
