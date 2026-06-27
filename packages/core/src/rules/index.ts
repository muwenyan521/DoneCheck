import type { SemanticJudgementDraft } from "../semantic/schema.js";
import {
  type CoverageInputItem,
  type CoverageResult,
  type EvaluateFinalJudgementInput,
  type EvaluateJudgementsInput,
  type FakeImplementationSignal,
  type FinalJudgement,
  type FinalJudgementKind,
  type FinalStatus,
  type JudgementReport,
  RULE_ENGINE_VERSION,
  type ReasonCode,
  type ScopeDrift,
  type SummaryStats,
  type TargetedStaticSignal,
  evaluateJudgementsInputSchema,
  finalJudgementSchema,
  judgementReportSchema,
} from "./schema.js";

type EvidenceStrength = "none" | "weak" | "medium" | "strong";

const statusWeight: Record<FinalStatus, number> = {
  "extra-scope": 0,
  fulfilled: 1,
  "insufficient-evidence": 0,
  partial: 0.5,
  "suspicious-fake-implementation": 0,
  unfulfilled: 0,
};

const emptySummaryStats: SummaryStats = {
  "extra-scope": 0,
  fulfilled: 0,
  "insufficient-evidence": 0,
  partial: 0,
  "suspicious-fake-implementation": 0,
  unfulfilled: 0,
};

export function buildJudgementReport(input: EvaluateJudgementsInput): JudgementReport {
  const parsed = evaluateJudgementsInputSchema.parse(input);
  const generatedAt = parsed.generatedAt;
  const judgements: FinalJudgement[] = [
    ...parsed.requirements.map((requirement) => {
      const semanticDraft = findDraft(parsed.semanticDrafts, "requirement", requirement.id);
      return evaluateFinalJudgement({
        fakeImplementationSignals: collectFakeSignals(
          parsed.fakeImplementationSignals,
          "requirement",
          requirement.id,
          semanticDraft,
        ),
        item: {
          id: `requirement:${requirement.id}`,
          kind: "requirement",
          sourceId: requirement.id,
        },
        ...(semanticDraft === undefined ? {} : { semanticDraft }),
        signals: collectStaticSignals(
          parsed.staticSignals,
          "requirement",
          requirement.id,
          semanticDraft,
        ),
      });
    }),
    ...parsed.claims.map((claim) => {
      const semanticDraft = findDraft(parsed.semanticDrafts, "claim", claim.id);
      return evaluateFinalJudgement({
        fakeImplementationSignals: collectFakeSignals(
          parsed.fakeImplementationSignals,
          "claim",
          claim.id,
          semanticDraft,
        ),
        item: { id: `claim:${claim.id}`, kind: "claim", sourceId: claim.id },
        ...(semanticDraft === undefined ? {} : { semanticDraft }),
        signals: collectStaticSignals(parsed.staticSignals, "claim", claim.id, semanticDraft),
      });
    }),
    ...parsed.extraScopeCandidates.map((candidate) =>
      evaluateFinalJudgement({
        extraScopeCandidate: candidate,
        item: {
          id: `extra-scope:${candidate.id}`,
          kind: "extra-scope",
          sourceId: candidate.sourceId,
        },
        signals: parsed.staticSignals,
      }),
    ),
  ];
  const summaryStats = summarizeStatuses(judgements);
  const report = {
    claimCoverage: calculateCoverage(judgements.filter((judgement) => judgement.kind === "claim")),
    generatedAt,
    judgements,
    requirementCoverage: calculateCoverage(
      judgements.filter((judgement) => judgement.kind === "requirement"),
    ),
    scopeDrift: calculateScopeDrift(summaryStats["extra-scope"], judgements.length),
    summaryStats,
    version: RULE_ENGINE_VERSION,
    warnings: buildWarnings(judgements),
  } satisfies JudgementReport;

  return judgementReportSchema.parse(report);
}

export const evaluateJudgements = buildJudgementReport;

export function evaluateFinalJudgement(input: EvaluateFinalJudgementInput): FinalJudgement {
  const signals = [...(input.signals ?? [])];
  const fakeImplementationSignals = [...(input.fakeImplementationSignals ?? [])];
  const evidenceStrength = calculateEvidenceStrength(signals, input.semanticDraft);
  const selection = selectStatus({
    evidenceStrength,
    extraScopeCandidatePresent: input.extraScopeCandidate !== undefined,
    fakeImplementationSignals,
    ...(input.semanticDraft === undefined ? {} : { semanticDraft: input.semanticDraft }),
  });
  const confidence = calculateConfidence(
    selection.finalStatus,
    evidenceStrength,
    input.semanticDraft,
  );
  const judgement = {
    confidence,
    confidenceLevel: confidenceLevel(confidence),
    evidenceRefs:
      input.extraScopeCandidate?.evidenceRefs ?? input.semanticDraft?.evidenceRefs ?? [],
    explanation: buildExplanation(selection.finalStatus, selection.reasonCode),
    finalStatus: selection.finalStatus,
    id: input.item.id,
    kind: input.item.kind,
    reasonCode: selection.reasonCode,
    ...(input.semanticDraft === undefined ? {} : { semanticDraft: input.semanticDraft }),
    signals: {
      evidenceStrength,
      fakeImplementationSignals,
      staticSignals: signals,
    },
    sourceId: input.item.sourceId,
  } satisfies FinalJudgement;

  return finalJudgementSchema.parse(judgement);
}

function calculateCoverage(items: readonly CoverageInputItem[]): CoverageResult {
  const included = items.filter((item) => item.finalStatus !== "insufficient-evidence");
  const weightedFulfilled = roundScore(
    included.reduce((total, item) => total + statusWeight[item.finalStatus], 0),
  );
  const denominator = included.length;
  const score = denominator === 0 ? 0 : roundScore(weightedFulfilled / denominator);

  return {
    denominator,
    excludedInsufficientEvidence: items.length - included.length,
    score,
    totalItems: items.length,
    weightedFulfilled,
  };
}

export function calculateScopeDrift(extraScopeCount: number, totalJudgements: number): ScopeDrift {
  const score = totalJudgements === 0 ? 0 : roundScore(extraScopeCount / totalJudgements);
  const level = score >= 0.5 ? "high" : score >= 0.2 ? "medium" : "low";

  return { extraScopeCount, level, score };
}

export type {
  CoverageResult,
  EvaluateFinalJudgementInput,
  EvaluateJudgementsInput,
  ExtraScopeCandidate,
  FakeImplementationSignal,
  FinalJudgement,
  FinalJudgementKind,
  FinalStatus,
  JudgementReport,
  ReasonCode,
  ScopeDrift,
  SummaryStats,
  TargetedStaticSignal,
} from "./schema.js";

export {
  RULE_ENGINE_VERSION,
  coverageResultSchema,
  evaluateJudgementsInputSchema,
  extraScopeCandidateSchema,
  fakeImplementationSignalSchema,
  finalJudgementKindSchema,
  finalJudgementSchema,
  finalStatusSchema,
  judgementReportSchema,
  reasonCodeSchema,
  scopeDriftSchema,
  summaryStatsSchema,
  targetedStaticSignalSchema,
} from "./schema.js";

function selectStatus(input: {
  readonly evidenceStrength: EvidenceStrength;
  readonly extraScopeCandidatePresent: boolean;
  readonly fakeImplementationSignals: readonly FakeImplementationSignal[];
  readonly semanticDraft?: SemanticJudgementDraft;
}): { finalStatus: FinalStatus; reasonCode: ReasonCode } {
  if (input.extraScopeCandidatePresent) {
    return { finalStatus: "extra-scope", reasonCode: "extra-scope-detected" };
  }
  if (hasConfirmedFakeSignal(input.fakeImplementationSignals)) {
    return {
      finalStatus: "suspicious-fake-implementation",
      reasonCode: "fake-implementation-signal-detected",
    };
  }
  if (input.semanticDraft === undefined) {
    return { finalStatus: "insufficient-evidence", reasonCode: "missing-semantic-draft" };
  }
  if (isWeakOrUnstable(input.semanticDraft, input.evidenceStrength)) {
    return { finalStatus: "insufficient-evidence", reasonCode: "weak-or-unstable-evidence" };
  }

  if (input.semanticDraft.judgementDraft === "fulfilled") {
    return input.evidenceStrength === "strong"
      ? { finalStatus: "fulfilled", reasonCode: "semantic-fulfilled-with-strong-evidence" }
      : { finalStatus: "partial", reasonCode: "semantic-fulfilled-with-incomplete-evidence" };
  }
  if (input.semanticDraft.judgementDraft === "partial") {
    return { finalStatus: "partial", reasonCode: "semantic-partial-with-supporting-evidence" };
  }
  if (input.semanticDraft.judgementDraft === "unsupported") {
    return {
      finalStatus: "unfulfilled",
      reasonCode: "semantic-unsupported-without-static-support",
    };
  }

  return { finalStatus: "unfulfilled", reasonCode: "suspicious-without-confirmed-fake-signal" };
}

function calculateEvidenceStrength(
  signals: readonly TargetedStaticSignal[],
  semanticDraft?: SemanticJudgementDraft,
): EvidenceStrength {
  if (signals.some((signal) => signal.strength === "strong")) return "strong";
  if (signals.some((signal) => signal.strength === "medium")) return "medium";
  if (signals.some((signal) => signal.strength === "weak")) return "weak";
  if ((semanticDraft?.evidenceRefs.length ?? 0) > 1) return "medium";
  if ((semanticDraft?.evidenceRefs.length ?? 0) === 1) return "weak";
  return "none";
}

function hasConfirmedFakeSignal(signals: readonly FakeImplementationSignal[]): boolean {
  return signals.some((signal) => signal.strength === "medium" || signal.strength === "strong");
}

function isWeakOrUnstable(
  draft: SemanticJudgementDraft,
  evidenceStrength: EvidenceStrength,
): boolean {
  if (draft.confidence < 0.45) return true;
  if (draft.confidence < 0.6 && (evidenceStrength === "none" || evidenceStrength === "weak")) {
    return true;
  }
  if (draft.judgementDraft === "partial" && evidenceStrength === "none") return true;
  return false;
}

function calculateConfidence(
  status: FinalStatus,
  evidenceStrength: EvidenceStrength,
  semanticDraft?: SemanticJudgementDraft,
): number {
  const base = semanticDraft?.confidence ?? (status === "extra-scope" ? 0.75 : 0.35);
  const modifier =
    evidenceStrength === "strong"
      ? 0.08
      : evidenceStrength === "medium"
        ? 0.03
        : evidenceStrength === "none"
          ? -0.12
          : -0.06;
  const statusModifier =
    status === "insufficient-evidence" ? -0.12 : status === "extra-scope" ? 0 : 0.02;

  return clampScore(base + modifier + statusModifier);
}

function confidenceLevel(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.45) return "medium";
  return "low";
}

function calculateStaticSortValue(signal: TargetedStaticSignal): number {
  if (signal.strength === "strong") return 3;
  if (signal.strength === "medium") return 2;
  return 1;
}

function filterStaticSignals(
  signals: readonly TargetedStaticSignal[],
  kind: Exclude<FinalJudgementKind, "extra-scope">,
  id: string,
): TargetedStaticSignal[] {
  return signals
    .filter(
      (signal) =>
        (signal.targetKind === undefined && signal.targetId === undefined) ||
        (signal.targetKind === kind && signal.targetId === id),
    )
    .sort((left, right) => calculateStaticSortValue(right) - calculateStaticSortValue(left));
}

function collectStaticSignals(
  signals: readonly TargetedStaticSignal[],
  kind: Exclude<FinalJudgementKind, "extra-scope">,
  id: string,
  draft?: SemanticJudgementDraft,
): TargetedStaticSignal[] {
  const ownSignals = filterStaticSignals(signals, kind, id);
  const relatedSignals =
    kind === "requirement" && draft?.matchedClaimId !== undefined
      ? filterStaticSignals(signals, "claim", draft.matchedClaimId)
      : kind === "claim" && draft?.matchedRequirementId !== undefined
        ? filterStaticSignals(signals, "requirement", draft.matchedRequirementId)
        : [];
  return uniqueSignals([...ownSignals, ...relatedSignals]);
}

function filterFakeSignals(
  signals: readonly FakeImplementationSignal[],
  kind: Exclude<FinalJudgementKind, "extra-scope">,
  id: string,
): FakeImplementationSignal[] {
  return signals.filter(
    (signal) =>
      (signal.targetKind === undefined && signal.targetId === undefined) ||
      (signal.targetKind === kind && signal.targetId === id),
  );
}

function collectFakeSignals(
  signals: readonly FakeImplementationSignal[],
  kind: Exclude<FinalJudgementKind, "extra-scope">,
  id: string,
  draft?: SemanticJudgementDraft,
): FakeImplementationSignal[] {
  const ownSignals = filterFakeSignals(signals, kind, id);
  const relatedSignals =
    kind === "requirement" && draft?.matchedClaimId !== undefined
      ? filterFakeSignals(signals, "claim", draft.matchedClaimId)
      : kind === "claim" && draft?.matchedRequirementId !== undefined
        ? filterFakeSignals(signals, "requirement", draft.matchedRequirementId)
        : [];
  return uniqueFakeSignals([...ownSignals, ...relatedSignals]);
}

function uniqueSignals(signals: readonly TargetedStaticSignal[]): TargetedStaticSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.filePath}:${signal.keyword}:${signal.strength}:${signal.targetKind ?? ""}:${signal.targetId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueFakeSignals(
  signals: readonly FakeImplementationSignal[],
): FakeImplementationSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.filePath}:${signal.pattern}:${signal.strength}:${signal.lineStart ?? ""}:${signal.lineEnd ?? ""}:${signal.targetKind ?? ""}:${signal.targetId ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findDraft(
  drafts: readonly SemanticJudgementDraft[],
  kind: Exclude<FinalJudgementKind, "extra-scope">,
  id: string,
): SemanticJudgementDraft | undefined {
  return drafts.find((draft) =>
    kind === "requirement" ? draft.matchedRequirementId === id : draft.matchedClaimId === id,
  );
}

function summarizeStatuses(judgements: readonly FinalJudgement[]): SummaryStats {
  const stats = { ...emptySummaryStats };
  for (const judgement of judgements) {
    stats[judgement.finalStatus] += 1;
  }
  return stats;
}

function buildWarnings(judgements: readonly FinalJudgement[]): string[] {
  const warnings = new Set<string>();
  if (judgements.some((judgement) => judgement.finalStatus === "insufficient-evidence")) {
    warnings.add(
      "Some items were excluded from coverage denominators due to insufficient evidence.",
    );
  }
  if (judgements.some((judgement) => judgement.signals.evidenceStrength === "weak")) {
    warnings.add("Some items rely only on weak static evidence.");
  }
  return [...warnings];
}

function buildExplanation(status: FinalStatus, reasonCode: ReasonCode): string {
  return `${status} selected by ${RULE_ENGINE_VERSION} because ${reasonCode}.`;
}

function clampScore(score: number): number {
  return Math.min(1, Math.max(0, roundScore(score)));
}

function roundScore(score: number): number {
  return Math.round(score * 100) / 100;
}
