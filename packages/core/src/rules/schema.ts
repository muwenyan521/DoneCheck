import {
  type FakeImplementationSignal,
  type FinalJudgement,
  type FinalJudgementKind,
  type SemanticJudgementDraft,
  type TargetedStaticSignal,
  fakeImplementationSignalSchema,
  semanticJudgementDraftSchema,
  targetedStaticSignalSchema,
} from "@donecheck/shared";
import { z } from "zod";
import {
  semanticClaimSchema,
  semanticEvidenceRefSchema,
  semanticRequirementSchema,
} from "../semantic/schema.js";

// Stage 4 report contracts live in `@donecheck/shared` so that consumers
// (report-ui, future GUI, export tooling) can `import type` the authoritative
// report shape without taking a runtime dependency on `core`. We re-export
// them here so existing imports from `./schema.js` keep working.
export {
  RULE_ENGINE_VERSION,
  confidenceLevelSchema,
  coverageResultSchema,
  fakeImplementationSignalSchema,
  finalJudgementKindSchema,
  finalJudgementSchema,
  finalStatusSchema,
  judgementReportSchema,
  reasonCodeSchema,
  scopeDriftSchema,
  summaryStatsSchema,
  targetedStaticSignalSchema,
} from "@donecheck/shared";

export type {
  ConfidenceLevel,
  CoverageResult,
  FakeImplementationSignal,
  FinalJudgement,
  FinalJudgementKind,
  FinalStatus,
  JudgementReport,
  ReasonCode,
  ScopeDrift,
  SummaryStats,
  TargetedStaticSignal,
} from "@donecheck/shared";

const nonEmptyTrimmedString = z.string().trim().min(1);

export const extraScopeCandidateSchema = z.object({
  evidenceRefs: z.array(semanticEvidenceRefSchema).default([]),
  id: nonEmptyTrimmedString,
  sourceId: nonEmptyTrimmedString,
  summary: nonEmptyTrimmedString,
});

export type ExtraScopeCandidate = z.infer<typeof extraScopeCandidateSchema>;

export const evaluateJudgementsInputSchema = z.object({
  claims: z.array(semanticClaimSchema).default([]),
  extraScopeCandidates: z.array(extraScopeCandidateSchema).default([]),
  fakeImplementationSignals: z.array(fakeImplementationSignalSchema).default([]),
  generatedAt: z.string().datetime(),
  requirements: z.array(semanticRequirementSchema).default([]),
  semanticDrafts: z.array(semanticJudgementDraftSchema).default([]),
  staticSignals: z.array(targetedStaticSignalSchema).default([]),
});

export type EvaluateJudgementsInput = z.infer<typeof evaluateJudgementsInputSchema>;

export interface EvaluateFinalJudgementInput {
  readonly extraScopeCandidate?: ExtraScopeCandidate;
  readonly fakeImplementationSignals?: readonly FakeImplementationSignal[];
  readonly item: {
    readonly id: string;
    readonly kind: FinalJudgementKind;
    readonly sourceId: string;
  };
  readonly semanticDraft?: SemanticJudgementDraft;
  readonly signals?: readonly TargetedStaticSignal[];
}

export type CoverageInputItem = Pick<FinalJudgement, "finalStatus" | "kind">;
