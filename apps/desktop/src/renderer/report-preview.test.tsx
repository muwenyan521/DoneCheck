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
    expect(html).toContain("Suspicious Fake Implementation: 1");
    expect(html).toContain("Extra Scope: 1");
    expect(html).toContain("67% · Denominator: 6 · Total items: 6 · Weighted fulfilled: 4");
    expect(html).toContain("50% · Denominator: 6 · Total items: 6 · Weighted fulfilled: 3");
    expect(html).toContain("33% · high");
    expect(html).toContain("localStorage");
  });

  it("switches locale and template without reshaping report data", () => {
    const html = renderToStaticMarkup(
      <ReportPreview locale="zh-CN" report={rendererFixtureReport} templateId="frontend" />,
    );

    expect(html).toContain("前端报告");
    expect(html).toContain("已兑现: 1");
    expect(html).toContain("范围偏离");
    expect(html).toContain("33% · high");
  });
});
