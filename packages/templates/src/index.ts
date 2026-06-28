export type ReportTemplateId = "frontend" | "generic" | "todo";

export type ReportTemplateScenario = "form" | "frontend" | "generic" | "todo";

export type ReportTemplateSection = "debug" | "judgements" | "overview" | "risk-highlights";

export type ReportTemplateFinalStatus =
  | "extra-scope"
  | "fulfilled"
  | "insufficient-evidence"
  | "partial"
  | "suspicious-fake-implementation"
  | "unfulfilled";

export type ReportTemplateReasonCode =
  | "extra-scope-detected"
  | "fake-implementation-signal-detected"
  | "missing-semantic-draft"
  | "semantic-fulfilled-with-incomplete-evidence"
  | "semantic-fulfilled-with-strong-evidence"
  | "semantic-partial-with-supporting-evidence"
  | "semantic-unsupported-without-static-support"
  | "suspicious-without-confirmed-fake-signal"
  | "weak-or-unstable-evidence";

export interface DoneCheckTemplate {
  readonly checks?: readonly string[];
  readonly descriptionKey: string;
  readonly highlights: {
    readonly reasonCodes: readonly ReportTemplateReasonCode[];
    readonly statuses: readonly ReportTemplateFinalStatus[];
  };
  readonly id: ReportTemplateId;
  readonly layout: {
    readonly defaultCollapsedSections: readonly ReportTemplateSection[];
    readonly sections: readonly ReportTemplateSection[];
  };
  readonly nameKey: string;
  readonly scenarios: readonly ReportTemplateScenario[];
}

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
      defaultCollapsedSections: ["debug"],
      sections: ["overview", "risk-highlights", "judgements", "debug"],
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
      defaultCollapsedSections: ["debug"],
      sections: ["overview", "judgements", "risk-highlights", "debug"],
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
      sections: ["overview", "risk-highlights", "debug", "judgements"],
    },
    nameKey: "template.frontend.name",
    scenarios: ["frontend", "form"],
  },
] as const satisfies readonly DoneCheckTemplate[];

export const defaultTemplate = reportTemplates[0];

export function getTemplateById(id: string): DoneCheckTemplate | undefined {
  return reportTemplates.find((template) => template.id === id);
}
