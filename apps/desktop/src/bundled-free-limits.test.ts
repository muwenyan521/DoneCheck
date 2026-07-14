import { describe, expect, it } from "vitest";
import { bundledFreeLimits, evaluateBundledFreeEligibility } from "./bundled-free-limits.js";

describe("bundled free project limits", () => {
  it.each([249, 250])("allows %i analyzable files", (analyzableFileCount) => {
    expect(
      evaluateBundledFreeEligibility({
        analyzableFileCount,
        largestAnalyzableFileBytes: 1,
        totalAnalyzableBytes: analyzableFileCount,
      }).eligible,
    ).toBe(true);
  });

  it("rejects the first file above the inclusive count limit", () => {
    expect(
      evaluateBundledFreeEligibility({
        analyzableFileCount: 251,
        largestAnalyzableFileBytes: 1,
        totalAnalyzableBytes: 251,
      }),
    ).toMatchObject({ eligible: false, exceeded: ["file-count"] });
  });

  it.each([
    [bundledFreeLimits.totalAnalyzableBytes - 1, true],
    [bundledFreeLimits.totalAnalyzableBytes, true],
    [bundledFreeLimits.totalAnalyzableBytes + 1, false],
  ])("applies the inclusive total-byte boundary %i", (totalAnalyzableBytes, eligible) => {
    expect(
      evaluateBundledFreeEligibility({
        analyzableFileCount: 8,
        largestAnalyzableFileBytes: Math.ceil(totalAnalyzableBytes / 8),
        totalAnalyzableBytes,
      }).eligible,
    ).toBe(eligible);
  });

  it.each([
    [bundledFreeLimits.largestAnalyzableFileBytes - 1, true],
    [bundledFreeLimits.largestAnalyzableFileBytes, true],
    [bundledFreeLimits.largestAnalyzableFileBytes + 1, false],
  ])("applies the inclusive largest-file boundary %i", (largestAnalyzableFileBytes, eligible) => {
    expect(
      evaluateBundledFreeEligibility({
        analyzableFileCount: 1,
        largestAnalyzableFileBytes,
        totalAnalyzableBytes: largestAnalyzableFileBytes,
      }).eligible,
    ).toBe(eligible);
  });
});
