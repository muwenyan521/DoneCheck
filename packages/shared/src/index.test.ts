import { describe, expect, it } from "vitest";
import {
  RULE_ENGINE_VERSION,
  checkResultSchema,
  checkSchema,
  confidenceLevelSchema,
  coverageResultSchema,
  doneCheckResultSchema,
  evidenceSchema,
  finalJudgementKindSchema,
  finalJudgementSchema,
  finalStatusSchema,
  judgementReportSchema,
  parseCheck,
  parseCheckResult,
  parseDoneCheckResult,
  parseEvidence,
  parseReportTemplate,
  parseRequirement,
  reasonCodeSchema,
  reportTemplateSchema,
  requirementSchema,
  safeParseCheck,
  safeParseCheckResult,
  safeParseDoneCheckResult,
  safeParseEvidence,
  safeParseRequirement,
  scopeDriftSchema,
  summaryStatsSchema,
} from "./index.js";
import type { FinalJudgement, JudgementReport, ReportTemplate, ReportTemplateId } from "./index.js";

const validRequirement = {
  id: "req-1",
  text: "Implement shared contracts and a core analysis skeleton.",
};

const validEvidence = {
  id: "ev-1",
  source: "test-output",
  text: "The implementation includes shared contracts, core analysis, tests, and build output.",
};

const validCheck = {
  description: "Evidence must be present.",
  id: "evidence-present",
};

const validCheckResult = {
  checkId: "evidence-present",
  message: "Evidence is present.",
  score: 1,
  status: "pass" as const,
};

const validDoneCheckResult = {
  checkedAt: "1970-01-01T00:00:00.000Z",
  checkResults: [validCheckResult],
  score: 1,
  status: "pass" as const,
  summary: "All checks passed.",
};

describe("requirementSchema", () => {
  it("accepts and parses a valid requirement", () => {
    expect(parseRequirement(validRequirement)).toEqual(validRequirement);
    expect(safeParseRequirement(validRequirement).success).toBe(true);
  });

  it("rejects an empty requirement text", () => {
    expect(() => requirementSchema.parse({ id: "req-1", text: "   " })).toThrow();
    expect(safeParseRequirement({ id: "req-1", text: "" }).success).toBe(false);
  });
});

describe("evidenceSchema", () => {
  it("accepts and parses a valid evidence item", () => {
    expect(parseEvidence(validEvidence)).toEqual(validEvidence);
    expect(safeParseEvidence(validEvidence).success).toBe(true);
  });

  it("rejects an evidence item without text", () => {
    expect(() => evidenceSchema.parse({ id: "ev-1", source: "test-output", text: "" })).toThrow();
    expect(safeParseEvidence({ id: "ev-1", source: "test-output" }).success).toBe(false);
  });
});

describe("checkSchema", () => {
  it("accepts and parses a valid check contract", () => {
    expect(parseCheck(validCheck)).toEqual(validCheck);
    expect(safeParseCheck(validCheck).success).toBe(true);
  });

  it("rejects a check without an id", () => {
    expect(() => checkSchema.parse({ description: "Evidence must be present." })).toThrow();
    expect(safeParseCheck({ id: "", description: "Evidence must be present." }).success).toBe(
      false,
    );
  });
});

describe("checkResultSchema", () => {
  it("accepts and parses a valid check result", () => {
    expect(parseCheckResult(validCheckResult)).toEqual(validCheckResult);
    expect(safeParseCheckResult(validCheckResult).success).toBe(true);
  });

  it("rejects a check result with an invalid status or score", () => {
    expect(() =>
      checkResultSchema.parse({
        checkId: "evidence-present",
        message: "Invalid.",
        score: 1.2,
        status: "unknown",
      }),
    ).toThrow();
    expect(
      safeParseCheckResult({
        checkId: "evidence-present",
        message: "Invalid.",
        score: -0.1,
        status: "fail",
      }).success,
    ).toBe(false);
  });
});

describe("doneCheckResultSchema", () => {
  it("accepts and parses a valid structured analysis result", () => {
    const parsed = parseDoneCheckResult(validDoneCheckResult);

    expect(parsed).toEqual(validDoneCheckResult);
    expect(safeParseDoneCheckResult(validDoneCheckResult).success).toBe(true);
  });

  it("rejects invalid status and empty check results", () => {
    expect(() =>
      doneCheckResultSchema.parse({
        checkedAt: "2026-06-26T00:00:00.000Z",
        checkResults: [],
        score: 0.5,
        status: "unknown",
        summary: "Invalid result.",
      }),
    ).toThrow();
    expect(
      safeParseDoneCheckResult({
        checkedAt: "not-a-date",
        checkResults: [validCheckResult],
        score: 0.5,
        status: "partial",
        summary: "Invalid date.",
      }).success,
    ).toBe(false);
  });
});

describe("reportTemplateSchema / parseReportTemplate", () => {
  const valid: ReportTemplate = {
    descriptionKey: "template.generic.description",
    highlights: {
      reasonCodes: ["fake-implementation-signal-detected"],
      statuses: ["suspicious-fake-implementation"],
    },
    id: "generic",
    layout: {
      defaultCollapsedSections: [],
      sections: ["overview", "judgements"],
    },
    nameKey: "template.generic.name",
    scenarios: ["generic"],
  };

  it("accepts a well-formed template", () => {
    expect(parseReportTemplate(valid)).toEqual(valid);
  });

  it("accepts optional checks field", () => {
    expect(parseReportTemplate({ ...valid, checks: ["req-present"] })).toEqual({
      ...valid,
      checks: ["req-present"],
    });
  });

  it("rejects unknown template id", () => {
    expect(() => reportTemplateSchema.parse({ ...valid, id: "unknown" })).toThrow();
  });

  it("rejects unknown reason code", () => {
    expect(() =>
      reportTemplateSchema.parse({
        ...valid,
        highlights: { ...valid.highlights, reasonCodes: ["bogus"] },
      }),
    ).toThrow();
  });

  it("ReportTemplateId is the literal union", () => {
    const id: ReportTemplateId = "frontend";
    expect(id).toBe("frontend");
  });
});

describe("stage 4 report contracts", () => {
  it("exposes the six finalStatus values and stable enums", () => {
    expect(finalStatusSchema.options).toEqual([
      "fulfilled",
      "partial",
      "insufficient-evidence",
      "unfulfilled",
      "suspicious-fake-implementation",
      "extra-scope",
    ]);
    expect(finalJudgementKindSchema.options).toEqual(["requirement", "claim", "extra-scope"]);
    expect(confidenceLevelSchema.options).toEqual(["low", "medium", "high"]);
    expect(reasonCodeSchema.options).toContain("fake-implementation-signal-detected");
    expect(reasonCodeSchema.options).toContain("extra-scope-detected");
  });

  it("exposes RULE_ENGINE_VERSION as the report version literal", () => {
    expect(RULE_ENGINE_VERSION).toBe("rules-v1");
    expect(judgementReportSchema.shape.version.value).toBe(RULE_ENGINE_VERSION);
  });

  it("parses a full JudgementReport produced by the rules engine shape", () => {
    const validJudgement: FinalJudgement = {
      confidence: 0.9,
      confidenceLevel: "high",
      evidenceRefs: [
        { filePath: "src/auth.ts", lineEnd: 12, lineStart: 10, snippetSummary: "Token persists." },
      ],
      explanation: "Logout handler is wired to an empty handler.",
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
    };

    const validReport: JudgementReport = {
      claimCoverage: {
        denominator: 1,
        excludedInsufficientEvidence: 0,
        score: 0,
        totalItems: 1,
        weightedFulfilled: 0,
      },
      consolidatedRepairPrompt: {
        content: { "zh-CN": "修复 claim:claim-fake。", en: "Repair claim:claim-fake." },
        includedJudgementIds: ["claim:claim-fake"],
        version: "repair-v1",
      },
      generatedAt: "2026-06-27T00:00:00.000Z",
      judgements: [validJudgement],
      requirementCoverage: {
        denominator: 0,
        excludedInsufficientEvidence: 0,
        score: 0,
        totalItems: 0,
        weightedFulfilled: 0,
      },
      scopeDrift: { extraScopeCount: 0, level: "low", score: 0 },
      summaryStats: {
        "extra-scope": 0,
        fulfilled: 0,
        "insufficient-evidence": 0,
        partial: 0,
        "suspicious-fake-implementation": 1,
        unfulfilled: 0,
      },
      version: RULE_ENGINE_VERSION,
      warnings: [],
    };

    expect(judgementReportSchema.parse(validReport)).toEqual(validReport);
    expect(finalJudgementSchema.parse(validJudgement)).toEqual(validJudgement);
  });

  it("rejects an invalid finalStatus and an out-of-range coverage score", () => {
    expect(() => finalStatusSchema.parse("unknown")).toThrow();
    expect(() =>
      coverageResultSchema.parse({
        denominator: 0,
        score: 1.5,
        totalItems: 0,
        weightedFulfilled: 0,
        excludedInsufficientEvidence: 0,
      }),
    ).toThrow();
    expect(() => scopeDriftSchema.parse({ extraScopeCount: -1, level: "low", score: 0 })).toThrow();
    expect(() =>
      summaryStatsSchema.parse({
        fulfilled: -1,
        partial: 0,
        "insufficient-evidence": 0,
        unfulfilled: 0,
        "suspicious-fake-implementation": 0,
        "extra-scope": 0,
      }),
    ).toThrow();
  });
});
