import { describe, expect, it } from "vitest";
import { runDesktopAnalysis, verifyDesktopStorage, verifyNativeStorageAvailable } from "./index.js";

describe("runDesktopAnalysis", () => {
  it("delegates analysis without requiring native storage", () => {
    const result = runDesktopAnalysis({
      evidence: "A passing build exists.",
      requirement: "Verify completion.",
      workspacePath: "/tmp/donecheck",
    });

    expect(result.status).toBe("partial");
  });
});

describe("verifyNativeStorageAvailable", () => {
  it("opens, writes, reads, and closes an in-memory SQLite database via better-sqlite3", () => {
    expect(verifyNativeStorageAvailable()).toBe(true);
  });

  it("fails fast for invalid storage paths without waiting for a test timeout", () => {
    expect(() =>
      verifyDesktopStorage({ databasePath: "/definitely-missing/donecheck.db" }),
    ).toThrow(/cannot open database|unable to open database file/i);
  });
});
