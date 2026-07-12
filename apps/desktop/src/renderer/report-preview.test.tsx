import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportPreview } from "./ReportPreview.js";
import { rendererFixtureReport } from "./fixtures.js";

describe("ReportPreview", () => {
  it("renders six statuses, both coverage values, and scope drift from report props", () => {
    const html = renderToStaticMarkup(
      <ReportPreview locale="en" report={rendererFixtureReport} templateId="generic" />,
    );

    expect(html).toContain("Fulfilled: 1");
    expect(html).toContain("Partial: 1");
    expect(html).toContain("Insufficient Evidence: 1");
    expect(html).toContain("Unfulfilled: 1");
    expect(html).toContain("Appears Complete Without Working Evidence: 1");
    expect(html).toContain("Extra Scope: 1");
    expect(html).toContain("67% · 6 items assessed · 6 items total · 1 awaiting evidence");
    expect(html).toContain("50% · 6 items assessed · 6 items total · 1 awaiting evidence");
    expect(html).not.toContain("Balanced report layout for general DoneCheck reviews.");
    expect(html).toContain("33% · High");
    expect(html).toContain('class="summary-stats"');
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("Source ID");
    for (const judgement of rendererFixtureReport.judgements) {
      expect(html).not.toContain(judgement.sourceId);
    }
  });

  it("switches locale and template without reshaping report data", () => {
    const html = renderToStaticMarkup(
      <ReportPreview locale="zh-CN" report={rendererFixtureReport} templateId="frontend" />,
    );

    expect(html).toContain("前端报告");
    expect(html).toContain("已兑现: 1");
    expect(html).toContain("需求之外的改动");
    expect(html).toContain("33% · 高");
  });
});
