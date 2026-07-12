import { describe, expect, it } from "vitest";
import { getAnalysisStatusText } from "./analysis-status-copy.js";

describe("analysis status copy", () => {
  it("distinguishes an incomplete form from a ready form", () => {
    expect(getAnalysisStatusText({ canAnalyze: false, locale: "zh-CN", notice: "" })).toBe(
      "选择项目目录并填写需求后开始分析。",
    );
    expect(getAnalysisStatusText({ canAnalyze: true, locale: "zh-CN", notice: "" })).toBe(
      "已准备好，可以开始分析。",
    );
    expect(getAnalysisStatusText({ canAnalyze: true, locale: "en", notice: "" })).toBe(
      "Ready to start analysis.",
    );
  });

  it("keeps user feedback ahead of the idle and ready fallbacks", () => {
    expect(
      getAnalysisStatusText({
        canAnalyze: true,
        locale: "en",
        notice: "Project folder selected.",
      }),
    ).toBe("Project folder selected.");
  });
});
