import { DONECHECK_SCHEMA_VERSION, type DoneCheckResult } from "@donecheck/shared";

export interface AnalyzeInput {
  readonly requirement: string;
  readonly evidence: string;
}

export function analyze(input: AnalyzeInput): DoneCheckResult {
  const passed = input.requirement.trim().length > 0 && input.evidence.trim().length > 0;

  return {
    checkedAt: new Date(0).toISOString(),
    passed,
    summary: passed
      ? `DoneCheck ${DONECHECK_SCHEMA_VERSION}: evidence is present for the requirement.`
      : `DoneCheck ${DONECHECK_SCHEMA_VERSION}: requirement and evidence are both required.`,
  };
}
