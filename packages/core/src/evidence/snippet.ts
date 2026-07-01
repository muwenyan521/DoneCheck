import type { EvidenceSnippet, SemanticEvidenceRef } from "../semantic/schema.js";

export interface ExtractSnippetInput {
  readonly content: string;
  readonly filePath: string;
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly id: string;
}

export function extractSnippet(input: ExtractSnippetInput): EvidenceSnippet {
  if (input.lineStart > input.lineEnd) {
    throw new Error(`lineStart (${input.lineStart}) must be <= lineEnd (${input.lineEnd})`);
  }
  const lines = input.content.split(/\r?\n/);
  const total = lines.length;
  const start = clamp(Math.max(1, input.lineStart), 1, total);
  const end = clamp(input.lineEnd, start, total);
  const text = lines.slice(start - 1, end).join("\n");
  const summary = buildSummary(text);
  return {
    filePath: input.filePath,
    id: input.id,
    lineStart: start,
    lineEnd: end,
    summary,
    text,
  };
}

export function extractEvidenceSnippets(input: {
  content: string;
  filePath: string;
  refs: readonly SemanticEvidenceRef[];
}): EvidenceSnippet[] {
  return input.refs.map((ref) =>
    extractSnippet({
      content: input.content,
      filePath: input.filePath,
      lineStart: ref.lineStart,
      lineEnd: ref.lineEnd,
      id: `${input.filePath}:${ref.lineStart}-${ref.lineEnd}`,
    }),
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function buildSummary(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  const trimmed = firstLine
    .replace(/^\s*\/\/\s*/, "")
    .replace(/^\s*\/\*\s*/, "")
    .replace(/\s*\*\/\s*$/, "")
    .trim();
  return trimmed.length > 0 ? truncated(trimmed, 120) : truncated(firstLine.trim(), 120);
}

function truncated(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
