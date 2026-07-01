import type { FakeImplementationSignal } from "@donecheck/shared";

export type FakePattern = FakeImplementationSignal["pattern"];

interface PatternSpec {
  readonly pattern: FakePattern;
  readonly regex: RegExp;
  readonly strength: "weak" | "medium" | "strong";
}

export const FAKE_PATTERNS: readonly PatternSpec[] = [
  { pattern: "alert-only", regex: /\balert\s*\(/g, strength: "strong" },
  {
    pattern: "not-implemented",
    regex: /\b(not implemented|not\s+yet\s+implemented)\b/gi,
    strength: "strong",
  },
  {
    pattern: "not-implemented",
    regex: /throw\s+new\s+Error\s*\(\s*["'`]not implemented["'`]/gi,
    strength: "strong",
  },
  { pattern: "todo", regex: /\b(TODO|FIXME)\b/g, strength: "medium" },
  { pattern: "empty-handler", regex: /\(\s*\)\s*=>\s*\{\s*\}/g, strength: "medium" },
  { pattern: "mock", regex: /\bmock-only\b/gi, strength: "strong" },
  { pattern: "mock", regex: /\/\*\s*mock\s*\*\//g, strength: "medium" },
];

export const STATIC_KEYWORDS: readonly { keyword: string; strength: "strong" }[] = [
  { keyword: "localStorage", strength: "strong" },
  { keyword: "auth", strength: "strong" },
  { keyword: "xlsx", strength: "strong" },
  { keyword: "@media", strength: "strong" },
];
