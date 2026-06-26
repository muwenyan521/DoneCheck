import { describe, expect, it } from "vitest";
import { analyze } from "./index.js";

describe("analyze", () => {
  it("returns a deterministic passing result when requirement and evidence are present", () => {
    const result = analyze({
      evidence: "The implementation includes tests and build output.",
      requirement: "Detect whether the work is actually complete.",
    });

    expect(result).toEqual({
      checkedAt: "1970-01-01T00:00:00.000Z",
      passed: true,
      summary: "DoneCheck 0.0.0: evidence is present for the requirement.",
    });
  });
});
