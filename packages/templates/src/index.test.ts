import { describe, expect, it } from "vitest";
import { defaultTemplate } from "./index.js";

describe("defaultTemplate", () => {
  it("exposes a non-empty default template with a stable identity", () => {
    expect(defaultTemplate.id).toBe("default");
    expect(defaultTemplate.name.length).toBeGreaterThan(0);
    expect(defaultTemplate.checks.length).toBeGreaterThan(0);
    for (const check of defaultTemplate.checks) {
      expect(check.length).toBeGreaterThan(0);
    }
  });
});
