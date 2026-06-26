import type { DoneCheckResult } from "@donecheck/shared";

export interface ReportSummaryProps {
  readonly result: DoneCheckResult;
}

export function ReportSummary({ result }: ReportSummaryProps) {
  return (
    <section aria-label="DoneCheck report summary">
      <strong>{result.status === "pass" ? "Passed" : "Needs work"}</strong>
      <p>{result.summary}</p>
      <time dateTime={result.checkedAt}>{result.checkedAt}</time>
    </section>
  );
}
