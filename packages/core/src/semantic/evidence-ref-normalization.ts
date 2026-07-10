import type { SemanticEvidenceRef } from "@donecheck/shared";
import type { EvidenceSnippet } from "./schema.js";

export type NormalizeEvidenceRefResult =
  | { readonly kind: "exact"; readonly ref: SemanticEvidenceRef }
  | { readonly kind: "normalized"; readonly ref: SemanticEvidenceRef; readonly warning: string }
  | { readonly kind: "unmatched"; readonly reason: string };

export interface NormalizedEvidenceRefs {
  readonly refs: readonly NormalizeEvidenceRefResult[];
  readonly warnings: readonly string[];
}

const NEAR_MISS_LINE_TOLERANCE = 1;
const NEAR_MISS_OVERLAP_RATIO = 0.8;

export function normalizeEvidenceRef(
  modelRef: SemanticEvidenceRef,
  candidates: readonly EvidenceSnippet[],
): NormalizeEvidenceRefResult {
  for (const candidate of candidates) {
    if (
      candidate.filePath === modelRef.filePath &&
      candidate.lineStart === modelRef.lineStart &&
      candidate.lineEnd === modelRef.lineEnd
    ) {
      return { kind: "exact", ref: modelRef };
    }
  }

  const sameFileCandidates = candidates.filter(
    (candidate) => candidate.filePath === modelRef.filePath,
  );
  if (sameFileCandidates.length === 0) {
    return unmatchedReason(modelRef, `no candidate snippet with filePath=${modelRef.filePath}`);
  }

  const scored = sameFileCandidates
    .map((candidate) => ({ candidate, score: nearMissScore(modelRef, candidate) }))
    .filter((entry) => entry.score.passes);

  if (scored.length === 0) {
    return unmatchedReason(
      modelRef,
      `no near-miss candidate within tolerance (lineTolerance=${NEAR_MISS_LINE_TOLERANCE}, overlapRatio>=${NEAR_MISS_OVERLAP_RATIO})`,
    );
  }

  const minTotalError = Math.min(...scored.map((entry) => entry.score.totalError));
  const best = scored.filter((entry) => entry.score.totalError === minTotalError);

  if (best.length > 1) {
    return unmatchedReason(
      modelRef,
      `ambiguous near-miss: ${best.length} candidates tie for best score (totalError=${minTotalError})`,
    );
  }

  const winnerEntry = best[0];
  if (winnerEntry === undefined) {
    return unmatchedReason(modelRef, "no near-miss candidate survived scoring");
  }
  const winner = winnerEntry.candidate;
  const normalizedRef: SemanticEvidenceRef = {
    filePath: winner.filePath,
    lineStart: winner.lineStart,
    lineEnd: winner.lineEnd,
    snippetSummary: winner.summary,
  };

  return {
    kind: "normalized",
    ref: normalizedRef,
    warning: `Evidence ref normalized from ${modelRef.filePath}:${modelRef.lineStart}-${modelRef.lineEnd} to ${winner.filePath}:${winner.lineStart}-${winner.lineEnd}.`,
  };
}

export function normalizeEvidenceRefs(
  modelRefs: readonly SemanticEvidenceRef[],
  candidates: readonly EvidenceSnippet[],
): NormalizedEvidenceRefs {
  const refs = modelRefs.map((modelRef) => normalizeEvidenceRef(modelRef, candidates));
  const warnings = refs
    .filter(
      (entry): entry is Extract<NormalizeEvidenceRefResult, { kind: "normalized" }> =>
        entry.kind === "normalized",
    )
    .map((entry) => entry.warning);
  return { refs, warnings };
}

interface NearMissScore {
  readonly passes: boolean;
  readonly totalError: number;
  readonly overlapRatio: number;
}

function nearMissScore(modelRef: SemanticEvidenceRef, candidate: EvidenceSnippet): NearMissScore {
  const overlapStart = Math.max(modelRef.lineStart, candidate.lineStart);
  const overlapEnd = Math.min(modelRef.lineEnd, candidate.lineEnd);
  const overlapLines = Math.max(0, overlapEnd - overlapStart + 1);
  const unionSpan =
    Math.max(modelRef.lineEnd, candidate.lineEnd) -
    Math.min(modelRef.lineStart, candidate.lineStart) +
    1;
  const overlapRatio = overlapLines / unionSpan;
  const startError = Math.abs(modelRef.lineStart - candidate.lineStart);
  const endError = Math.abs(modelRef.lineEnd - candidate.lineEnd);
  const totalError = startError + endError;

  const passes =
    overlapLines > 0 &&
    startError <= NEAR_MISS_LINE_TOLERANCE &&
    endError <= NEAR_MISS_LINE_TOLERANCE &&
    overlapRatio >= NEAR_MISS_OVERLAP_RATIO;

  return { passes, totalError, overlapRatio };
}

function unmatchedReason(
  modelRef: SemanticEvidenceRef,
  detail: string,
): NormalizeEvidenceRefResult {
  return {
    kind: "unmatched",
    reason: `${modelRef.filePath}:${modelRef.lineStart}-${modelRef.lineEnd} ${detail}`,
  };
}
