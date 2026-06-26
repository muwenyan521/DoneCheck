import { type AnalyzeInput, analyze } from "@donecheck/core";
import Database from "better-sqlite3";

export interface DesktopAnalysisRequest extends AnalyzeInput {
  readonly workspacePath: string;
}

export function runDesktopAnalysis(request: DesktopAnalysisRequest) {
  return analyze({
    evidence: request.evidence,
    requirement: request.requirement,
  });
}

/**
 * Opens an in-memory SQLite database, writes a row, reads it back, and closes
 * the connection. This is a real smoke test that exercises the better-sqlite3
 * native module end-to-end so the build cannot silently regress into a shell
 * that never actually loads the native dependency.
 */
export function verifyNativeStorageAvailable(): boolean {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE smoke (id INTEGER PRIMARY KEY)");
    db.prepare("INSERT INTO smoke (id) VALUES (?)").run(1);
    const row = db.prepare("SELECT id FROM smoke").get() as { id: number } | undefined;
    return row?.id === 1;
  } finally {
    db.close();
  }
}
