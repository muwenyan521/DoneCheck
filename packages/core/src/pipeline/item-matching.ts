import type { FakeImplementationSignal, TargetedStaticSignal } from "../rules/schema.js";
import type {
  SemanticClaim,
  SemanticEvidenceRef,
  SemanticRequirement,
} from "../semantic/schema.js";

export interface ClaimMatch {
  readonly claim: SemanticClaim;
  readonly requirement: SemanticRequirement;
  readonly score: number;
}

export interface ExtraScopeCandidateDraft {
  readonly evidenceRefs: SemanticEvidenceRef[];
  readonly id: string;
  readonly sourceId: string;
  readonly summary: string;
}

const stopWords = new Set([
  "and",
  "the",
  "with",
  "that",
  "this",
  "where",
  "user",
  "users",
  "current",
  "implemented",
  "implement",
  "provide",
  "should",
  "must",
  "into",
  "from",
  "have",
  "has",
  "是否",
  "真正",
  "完成",
  "实现",
]);

const additiveWords = new Set([
  "also",
  "additionally",
  "extra",
  "added",
  "addition",
  "新增",
  "额外",
  "另外",
]);

const negativeWords = new Set([
  "avoid",
  "forbid",
  "forbidden",
  "no",
  "not",
  "without",
  "不要",
  "禁止",
  "不得",
]);

export function matchClaimsToRequirements(
  requirements: readonly SemanticRequirement[],
  claims: readonly SemanticClaim[],
): ClaimMatch[] {
  const matches: ClaimMatch[] = [];
  const usedClaims = new Set<string>();
  for (const requirement of requirements) {
    const ranked = claims
      .filter((claim) => !usedClaims.has(claim.id))
      .map((claim) => ({ claim, requirement, score: matchScore(requirement, claim) }))
      .filter((match) => match.score >= 0.16)
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    if (best === undefined) continue;
    matches.push(best);
    usedClaims.add(best.claim.id);
  }
  return matches;
}

export function targetSignals(input: {
  readonly candidateFiles?: readonly string[];
  readonly claims: readonly SemanticClaim[];
  readonly fakeImplementationSignals: readonly FakeImplementationSignal[];
  readonly matches: readonly ClaimMatch[];
  readonly requirements: readonly SemanticRequirement[];
  readonly staticSignals: readonly TargetedStaticSignal[];
}): {
  readonly fakeImplementationSignals: FakeImplementationSignal[];
  readonly staticSignals: TargetedStaticSignal[];
} {
  if (input.requirements.length <= 1) {
    const candidateFiles = input.candidateFiles;
    if (candidateFiles === undefined) {
      return {
        fakeImplementationSignals: input.fakeImplementationSignals.map((signal) => ({ ...signal })),
        staticSignals: input.staticSignals.map((signal) => ({ ...signal })),
      };
    }
    const candidateSet = new Set(candidateFiles);
    return {
      fakeImplementationSignals: input.fakeImplementationSignals
        .filter((signal) => candidateSet.has(signal.filePath))
        .map((signal) => ({ ...signal })),
      staticSignals: input.staticSignals
        .filter((signal) => candidateSet.has(signal.filePath))
        .map((signal) => ({ ...signal })),
    };
  }
  const candidateFiles = input.candidateFiles;
  return {
    fakeImplementationSignals: input.fakeImplementationSignals.flatMap((signal) =>
      targetOneSignal(signal, input.requirements, input.claims, input.matches, candidateFiles),
    ),
    staticSignals: input.staticSignals.flatMap((signal) =>
      targetOneSignal(signal, input.requirements, input.claims, input.matches, candidateFiles),
    ),
  };
}

export function buildExtraScopeCandidates(input: {
  readonly claims: readonly SemanticClaim[];
  readonly matches: readonly ClaimMatch[];
  readonly requirements: readonly SemanticRequirement[];
}): ExtraScopeCandidateDraft[] {
  const matchedClaimIds = new Set(input.matches.map((match) => match.claim.id));
  return input.claims
    .filter((claim) => !matchedClaimIds.has(claim.id))
    .filter(
      (claim) =>
        hasAdditiveLanguage(claim.text) ||
        conflictsWithNegativeRequirement(claim, input.requirements),
    )
    .map((claim) => ({
      evidenceRefs: [],
      id: `extra-${claim.id}`,
      sourceId: claim.id,
      summary: claim.text,
    }));
}

export function similarity(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function targetOneSignal<T extends FakeImplementationSignal | TargetedStaticSignal>(
  signal: T,
  requirements: readonly SemanticRequirement[],
  claims: readonly SemanticClaim[],
  matches: readonly ClaimMatch[],
  candidateFiles?: readonly string[],
): T[] {
  const candidates = [
    ...requirements.map((requirement) => ({ kind: "requirement" as const, item: requirement })),
    ...claims.map((claim) => ({ kind: "claim" as const, item: claim })),
  ]
    .map((candidate) => ({
      ...candidate,
      score: scoreSignal(signal.filePath, candidate.item.text),
    }))
    .filter((candidate) => candidate.score >= 0.12)
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  if (best === undefined) {
    if (candidateFiles?.includes(signal.filePath)) {
      return [{ ...signal, targetKind: undefined, targetId: undefined } as T];
    }
    return [];
  }
  const paired = pairedTargets(best.kind, best.item.id, matches);
  return [
    { ...signal, targetKind: best.kind, targetId: best.item.id } as T,
    ...paired.map((target) => ({ ...signal, targetKind: target.kind, targetId: target.id }) as T),
  ];
}

function pairedTargets(
  kind: "claim" | "requirement",
  id: string,
  matches: readonly ClaimMatch[],
): { readonly kind: "claim" | "requirement"; readonly id: string }[] {
  return matches.flatMap<{ readonly kind: "claim" | "requirement"; readonly id: string }>(
    (match) => {
      if (kind === "requirement" && match.requirement.id === id) {
        return [{ kind: "claim" as const, id: match.claim.id }];
      }
      if (kind === "claim" && match.claim.id === id) {
        return [{ kind: "requirement" as const, id: match.requirement.id }];
      }
      return [];
    },
  );
}

function scoreSignal(filePath: string, text: string): number {
  const pathTokens = tokens(filePath.replace(/\.[^.]+$/u, " ").replace(/[/-]/gu, " "));
  const itemTokens = tokens(text);
  if (pathTokens.size === 0 || itemTokens.size === 0) return 0;
  const intersection = [...pathTokens].filter((token) => itemTokens.has(token)).length;
  return intersection / pathTokens.size;
}

function numberedBonus(requirementId: string, claimId: string): number {
  return requirementId.match(/(\d+)$/u)?.[1] === claimId.match(/(\d+)$/u)?.[1] ? 0.1 : 0;
}

function matchScore(requirement: SemanticRequirement, claim: SemanticClaim): number {
  const semanticScore = similarity(requirement.text, claim.text);
  const bonus = numberedBonus(requirement.id, claim.id);
  if (bonus > 0 && semanticScore >= 0.08) return semanticScore + bonus;
  return semanticScore;
}

function hasAdditiveLanguage(text: string): boolean {
  return [...tokens(text)].some((token) => additiveWords.has(token));
}

function conflictsWithNegativeRequirement(
  claim: SemanticClaim,
  requirements: readonly SemanticRequirement[],
): boolean {
  return requirements.some((requirement) => {
    const requirementTokens = tokens(requirement.text);
    if (![...requirementTokens].some((token) => negativeWords.has(token))) return false;
    return similarity(requirement.text, claim.text) >= 0.1;
  });
}

function tokens(text: string): Set<string> {
  const baseTokens = (text.match(/[\p{L}\p{N}]+/gu) ?? [])
    .flatMap(splitCompoundToken)
    .map((token) => token.toLocaleLowerCase())
    .filter((token) => token.length >= 3)
    .filter((token) => !stopWords.has(token));
  return new Set([...baseTokens, ...extractCjkBigrams(text)]);
}

function extractCjkBigrams(text: string): string[] {
  const cjkRanges = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/gu) ?? [];
  return cjkRanges.flatMap((range) => {
    const bigrams: string[] = [];
    for (let i = 0; i < range.length - 1; i += 1) {
      bigrams.push(range.slice(i, i + 2));
    }
    return bigrams;
  });
}

function splitCompoundToken(token: string): string[] {
  const parts = token
    .replace(/([a-z])([A-Z])/gu, "$1 $2")
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter((part) => part.length >= 3 && !stopWords.has(part));
  return parts.length > 1 ? [token, ...parts] : [token];
}
