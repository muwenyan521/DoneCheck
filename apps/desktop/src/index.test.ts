import { describe, expect, it } from "vitest";
import { runDesktopAnalysis, verifyNativeStorageAvailable } from "./index.js";

describe("runDesktopAnalysis", () => {
  it("delegates analysis without requiring native storage", () => {
    const result = runDesktopAnalysis({
      evidence: "A passing build exists.",
      requirement: "Verify completion.",
      workspacePath: "/tmp/donecheck",
    });

    expect(result.passed).toBe(true);
  });
});

describe("verifyNativeStorageAvailable", () => {
  it("opens, writes, reads, and closes an in-memory SQLite database via better-sqlite3", () => {
    expect(verifyNativeStorageAvailable()).toBe(true);
  });
});
