import { describe, expect, it } from "vitest";
import { defaultTemplate, getTemplateById, reportTemplates } from "./index.js";

describe("reportTemplates", () => {
  it("exposes generic, todo, and frontend templates with stable display configuration", () => {
    expect(reportTemplates.map((template) => template.id)).toEqual(["generic", "todo", "frontend"]);
    for (const template of reportTemplates) {
      expect(template.nameKey).toBe(`template.${template.id}.name`);
      expect(template.descriptionKey).toBe(`template.${template.id}.description`);
      expect(template.scenarios.length).toBeGreaterThan(0);
      expect(template.layout.sections.length).toBeGreaterThan(0);
      expect(
        template.highlights.statuses.length + template.highlights.reasonCodes.length,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps template switching display-only by changing layout and highlights without checks", () => {
    const generic = getTemplateById("generic");
    const todo = getTemplateById("todo");
    const frontend = getTemplateById("frontend");

    expect(generic).toBeDefined();
    expect(todo).toBeDefined();
    expect(frontend).toBeDefined();

    expect(generic?.layout.sections).not.toEqual(todo?.layout.sections);
    expect(todo?.layout.defaultCollapsedSections).toEqual([]);
    expect(frontend?.highlights.reasonCodes).toContain("fake-implementation-signal-detected");
    expect(generic && "checks" in generic).toBe(false);
    expect(todo && "checks" in todo).toBe(false);
    expect(frontend && "checks" in frontend).toBe(false);
  });

  it("preserves the legacy defaultTemplate identity as the generic report template", () => {
    expect(defaultTemplate).toBe(getTemplateById("generic"));
    expect(defaultTemplate.id).toBe("generic");
  });

  it("returns undefined for unknown template ids", () => {
    expect(getTemplateById("unknown")).toBeUndefined();
  });
});
