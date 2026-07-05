import type { FakeImplementationSignal, TargetedStaticSignal } from "../rules/schema.js";
import type { EvidenceSnippet, SemanticClaim, SemanticRequirement } from "../semantic/schema.js";
import type { ClaimMatch } from "./item-matching.js";

export interface EvidenceSelectionBudget {
  readonly maxEvidenceChars: number;
  readonly maxSnippets: number;
  readonly maxSnippetsPerFile: number;
  readonly minSnippets: number;
}

export interface SelectEvidenceForRequirementInput {
  readonly budget?: Partial<EvidenceSelectionBudget>;
  readonly candidateFiles: readonly string[];
  readonly claim?: SemanticClaim;
  readonly evidenceSnippets: readonly EvidenceSnippet[];
  readonly fakeImplementationSignals?: readonly FakeImplementationSignal[];
  readonly match?: ClaimMatch;
  readonly requirement: SemanticRequirement;
  readonly staticSignals?: readonly TargetedStaticSignal[];
}

interface RankedSnippet {
  readonly snippet: EvidenceSnippet;
  readonly score: number;
}

export const defaultEvidenceSelectionBudget: EvidenceSelectionBudget = {
  maxEvidenceChars: 20_000,
  maxSnippets: 16,
  maxSnippetsPerFile: 4,
  minSnippets: 2,
};

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
  "can",
  "includes",
  "include",
  "feature",
  "完成",
  "实现",
  "用户",
]);

export function selectEvidenceForRequirement(
  input: SelectEvidenceForRequirementInput,
): EvidenceSnippet[] {
  const budget = normalizeBudget(input.budget);
  if (input.evidenceSnippets.length === 0 || budget.maxSnippets < 1) return [];
  const ranked = input.evidenceSnippets
    .map((snippet) => ({ snippet, score: scoreSnippet(snippet, input) }))
    .sort(compareRankedSnippets);
  const relevanceFloor = relevanceFloorFor(ranked);
  const conservativeLimit = shouldUseConservativeFallback(ranked)
    ? Math.max(1, Math.min(budget.minSnippets, budget.maxSnippets))
    : budget.maxSnippets;
  const selected: EvidenceSnippet[] = [];
  const selectedKeys = new Set<string>();
  const perFileCounts = new Map<string, number>();
  let totalChars = 0;
  const add = (snippet: EvidenceSnippet): boolean => {
    const key = snippetKey(snippet);
    if (selectedKeys.has(key)) return false;
    if (selected.length >= conservativeLimit) return false;
    const fileCount = perFileCounts.get(snippet.filePath) ?? 0;
    if (fileCount >= budget.maxSnippetsPerFile) return false;
    const nextChars = totalChars + snippet.text.length;
    if (selected.length >= Math.max(1, budget.minSnippets) && nextChars > budget.maxEvidenceChars) {
      return false;
    }
    selected.push(snippet);
    selectedKeys.add(key);
    perFileCounts.set(snippet.filePath, fileCount + 1);
    totalChars = nextChars;
    return true;
  };
  for (const filePath of targetedSignalFiles(input)) {
    const best = ranked.find((item) => item.snippet.filePath === filePath);
    if (best !== undefined) add(best.snippet);
  }
  for (const item of ranked) {
    if (item.score >= relevanceFloor) add(item.snippet);
  }
  if (selected.length === 0) {
    for (const item of ranked.slice(
      0,
      Math.max(1, Math.min(budget.minSnippets, budget.maxSnippets)),
    )) {
      add(item.snippet);
    }
  }
  return selected.sort((left, right) =>
    compareRankedSnippets(
      { snippet: left, score: scoreSnippet(left, input) },
      { snippet: right, score: scoreSnippet(right, input) },
    ),
  );
}

function normalizeBudget(
  budget: Partial<EvidenceSelectionBudget> | undefined,
): EvidenceSelectionBudget {
  return {
    maxEvidenceChars: Math.max(
      1,
      budget?.maxEvidenceChars ?? defaultEvidenceSelectionBudget.maxEvidenceChars,
    ),
    maxSnippets: Math.max(0, budget?.maxSnippets ?? defaultEvidenceSelectionBudget.maxSnippets),
    maxSnippetsPerFile: Math.max(
      1,
      budget?.maxSnippetsPerFile ?? defaultEvidenceSelectionBudget.maxSnippetsPerFile,
    ),
    minSnippets: Math.max(1, budget?.minSnippets ?? defaultEvidenceSelectionBudget.minSnippets),
  };
}

function scoreSnippet(snippet: EvidenceSnippet, input: SelectEvidenceForRequirementInput): number {
  const requirementTokens = tokens(input.requirement.text);
  const claimTokens = tokens(input.claim?.text ?? input.match?.claim.text ?? "");
  const queryTokens = unionTokens(requirementTokens, claimTokens);
  const pathTokens = tokens(snippet.filePath.replace(/\.[^.]+$/u, " ").replace(/[/-]/gu, " "));
  const snippetTokens = tokens(`${snippet.summary} ${snippet.text}`);
  const candidateIndex = input.candidateFiles.indexOf(snippet.filePath);
  const signalFiles = targetedSignalFiles(input);
  let score = 0;
  score += tokenOverlapScore(pathTokens, queryTokens) * 8;
  score += tokenOverlapScore(snippetTokens, queryTokens) * 6;
  score += tokenOverlapScore(pathTokens, requirementTokens) * 3;
  score += tokenOverlapScore(snippetTokens, requirementTokens) * 2;
  score += tokenOverlapScore(pathTokens, claimTokens) * 3;
  score += tokenOverlapScore(snippetTokens, claimTokens) * 2;
  if (candidateIndex >= 0) score += 2 + 1 / (candidateIndex + 1);
  if (signalFiles.includes(snippet.filePath)) score += 20;
  if (snippet.lineStart === 1) score += 0.1;
  return score;
}

function targetedSignalFiles(input: SelectEvidenceForRequirementInput): string[] {
  const targetIds = new Set<string>([input.requirement.id]);
  if (input.claim !== undefined) targetIds.add(input.claim.id);
  if (input.match !== undefined) {
    targetIds.add(input.match.requirement.id);
    targetIds.add(input.match.claim.id);
  }
  return [
    ...(input.fakeImplementationSignals ?? []).filter((signal) =>
      signal.targetId === undefined ? false : targetIds.has(signal.targetId),
    ),
    ...(input.staticSignals ?? []).filter((signal) =>
      signal.targetId === undefined ? false : targetIds.has(signal.targetId),
    ),
  ]
    .map((signal) => signal.filePath)
    .sort((left, right) => left.localeCompare(right))
    .filter((filePath, index, items) => index === 0 || items[index - 1] !== filePath);
}

function shouldUseConservativeFallback(ranked: readonly RankedSnippet[]): boolean {
  const best = ranked[0]?.score ?? 0;
  return best < 6;
}

function relevanceFloorFor(ranked: readonly RankedSnippet[]): number {
  const best = ranked[0]?.score ?? 0;
  if (best <= 0) return 0;
  return Math.max(3, best * 0.35);
}

function compareRankedSnippets(left: RankedSnippet, right: RankedSnippet): number {
  if (right.score !== left.score) return right.score - left.score;
  const pathOrder = left.snippet.filePath.localeCompare(right.snippet.filePath);
  if (pathOrder !== 0) return pathOrder;
  if (left.snippet.lineStart !== right.snippet.lineStart)
    return left.snippet.lineStart - right.snippet.lineStart;
  return left.snippet.lineEnd - right.snippet.lineEnd;
}

function tokenOverlapScore(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(left.size, right.size);
}

function unionTokens(left: ReadonlySet<string>, right: ReadonlySet<string>): Set<string> {
  return new Set([...left, ...right]);
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .map(normalizeToken)
      .filter((token) => token.length >= 2 && !stopWords.has(token)),
  );
}

function normalizeToken(token: string): string {
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function snippetKey(snippet: EvidenceSnippet): string {
  return `${snippet.filePath}:${snippet.lineStart}-${snippet.lineEnd}`;
}
