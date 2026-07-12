import type { ReportTemplate } from "@donecheck/shared";

export type {
  ReportTemplate,
  ReportTemplateFinalStatus,
  ReportTemplateId,
  ReportTemplateReasonCode,
  ReportTemplateScenario,
  ReportTemplateSection,
} from "@donecheck/shared";

export const reportTemplates = [
  {
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
  },
  {
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
    scenarios: ["todo", "generic"],
  },
  {
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
    scenarios: ["frontend", "form"],
  },
] as const satisfies readonly ReportTemplate[];

export const defaultTemplate = reportTemplates[0];

export function getTemplateById(id: string): ReportTemplate | undefined {
  return reportTemplates.find((template) => template.id === id);
}
