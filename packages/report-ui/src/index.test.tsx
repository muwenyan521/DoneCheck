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
  warnings: ["One requirement has insufficient evidence."],
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
    defaultCollapsedSections: ["debug"],
    sections: ["overview", "risk-highlights", "judgements", "debug"],
  },
  nameKey: "template.generic.name",
  scenarios: ["generic"],
};

const todoTemplate: ReportTemplate = {
  ...genericTemplate,
  descriptionKey: "template.todo.description",
  id: "todo",
  layout: {
    defaultCollapsedSections: ["debug"],
    sections: ["overview", "judgements", "risk-highlights", "debug"],
  },
  nameKey: "template.todo.name",
  scenarios: ["todo"],
};

const frontendTemplate: ReportTemplate = {
  ...genericTemplate,
  descriptionKey: "template.frontend.description",
  id: "frontend",
  layout: {
    defaultCollapsedSections: [],
    sections: ["overview", "risk-highlights", "debug", "judgements"],
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
  it("renders a complete JudgementReport with overview, six final statuses, risks, and debug data", () => {
    const markup = html();

    expect(markup).toContain("DoneCheck 阶段 5 报告");
    expect(markup).toContain("需求覆盖率");
    expect(markup).toContain("75%");
    expect(markup).toContain("承诺覆盖率");
    expect(markup).toContain("25%");
    expect(markup).toContain("范围偏离");
    expect(markup).toContain("medium");
    expect(markup).toContain("分母: 2");
    expect(markup).toContain("证据不足剔除: 1");
    expect(markup).toContain("rules-v1");
    expect(markup).toContain("2026-06-27T00:00:00.000Z");
    for (const label of ["已兑现", "部分兑现", "证据不足", "未兑现", "疑似假实现", "需求外范围"]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("疑似假实现");
    expect(markup).toContain("需求外范围");
    expect(markup).toContain("证据不足");
    expect(markup).toContain("语义草案");
    expect(markup).toContain("假实现信号");
    expect(markup).toContain("静态召回信号");
    expect(markup).toContain("类型");
    expect(markup).toContain("requirement");
  });

  it("switches zh-CN and en user-visible copy for the same report", () => {
    const zh = html(genericTemplate, "zh-CN");
    const en = html(genericTemplate, "en");

    expect(zh).toContain("DoneCheck 阶段 5 报告");
    expect(zh).toContain("疑似假实现");
    expect(en).toContain("DoneCheck Stage 5 Report");
    expect(en).toContain("Suspicious Fake Implementation");
    expect(en).toContain("Fake implementation signals");
    expect(en).toContain("Confidence Level");
    expect(en).not.toContain("DoneCheck 阶段 5 报告");
  });

  it("maps reasonCode to localized display copy instead of exposing raw keys", () => {
    const markup = html(genericTemplate, "en");

    expect(markup).toContain("Fake implementation signal detected");
    expect(markup).toContain("Extra scope detected");
    expect(markup).not.toContain("fake-implementation-signal-detected");
    expect(markup).not.toContain("extra-scope-detected");
  });

  it("falls back safely for unknown reasonCode and missing translation keys", () => {
    expect(translateReasonCode("unknown-code", "en")).toBe("Unknown reason: unknown-code");
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

    expect(markup).toContain("Unknown reason: unknown-code");
    expect(markup).toContain("template.missing.name");
  });

  it("uses template configuration to change section order and highlighted items without mutating report data", () => {
    const before = JSON.stringify(report);
    const generic = html(genericTemplate, "en");
    const todo = html(todoTemplate, "en");
    const frontend = html(frontendTemplate, "en");

    expect(generic.indexOf("Risk Highlights")).toBeLessThan(generic.indexOf("Judgements"));
    expect(todo.indexOf("Judgements")).toBeLessThan(todo.indexOf("Risk Highlights"));
    expect(frontend.indexOf("Debug Details")).toBeLessThan(frontend.indexOf("Judgements"));
    expect(generic).toContain('data-highlighted="true"');
    expect(JSON.stringify(report)).toBe(before);
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
    expect(document).toContain("DoneCheck Stage 5 Report");
    expect(document).toContain("Fake implementation signal detected");
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

    // The rules-version literal and timestamp must round-trip into the DOM.
    expect(markup).toContain("rules-v1");
    expect(markup).toContain("2026-06-27T00:00:00.000Z");

    // Every finalStatus that the engine can emit must be rendered using the
    // shared status dictionary. This proves report-ui and core/rules agree
    // on the enum surface.
    for (const label of [
      "Fulfilled",
      "Insufficient Evidence",
      "Unfulfilled",
      "Suspicious Fake Implementation",
      "Extra Scope",
    ]) {
      expect(markup).toContain(label);
    }

    // The reasonCode -> localized copy mapping must work for real outputs.
    expect(markup).toContain("Fake implementation signal detected");
    expect(markup).toContain("Extra scope detected");

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

    expect(markup).toContain("DoneCheck 阶段 5 报告");
    expect(markup).toContain("已兑现");
    expect(markup).toContain("强证据支持已兑现");
    expect(markup).toContain("rules-v1");
  });
});
