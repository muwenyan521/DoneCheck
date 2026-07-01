import type { FakeImplementationSignal, StaticSignal } from "@donecheck/shared";
import { FAKE_PATTERNS, STATIC_KEYWORDS } from "./patterns.js";

export function scanFakeImplementationSignals(input: {
  filePath: string;
  content: string;
}): FakeImplementationSignal[] {
  const lines = input.content.split(/\r?\n/);
  const out: FakeImplementationSignal[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const lineNum = i + 1;
    for (const spec of FAKE_PATTERNS) {
      const re = new RegExp(
        spec.regex.source,
        spec.regex.flags.includes("g") ? spec.regex.flags : `${spec.regex.flags}g`,
      );
      re.lastIndex = 0;
      while (re.exec(line) !== null) {
        out.push({
          filePath: input.filePath,
          lineStart: lineNum,
          lineEnd: lineNum,
          pattern: spec.pattern,
          strength: spec.strength,
        });
      }
    }
  }
  return dedupeFake(out);
}

export function scanStaticSignals(input: {
  filePath: string;
  content: string;
}): StaticSignal[] {
  const out: StaticSignal[] = [];
  const lowerContent = input.content.toLowerCase();
  for (const { keyword, strength } of STATIC_KEYWORDS) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      out.push({ filePath: input.filePath, keyword, strength });
    }
  }
  return out;
}

function dedupeFake(signals: FakeImplementationSignal[]): FakeImplementationSignal[] {
  const seen = new Set<string>();
  const result: FakeImplementationSignal[] = [];
  for (const s of signals) {
    const key = `${s.filePath}:${s.lineStart}:${s.pattern}:${s.strength}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(s);
  }
  return result;
}
