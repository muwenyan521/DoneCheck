import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractStatusCoverage } from "./extract-status-coverage.mjs";

const directories = [];

function createDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "donecheck-coverage-script-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("extractStatusCoverage", () => {
  it("merges final-status coverage from multiple report artifacts without modifying them", async () => {
    const directory = createDirectory();
    const firstReportPath = path.join(directory, "first-report.json");
    const secondReportPath = path.join(directory, "second-report.json");
    writeFileSync(
      firstReportPath,
      JSON.stringify({
        judgements: [
          { id: "J-fulfilled", finalStatus: "fulfilled" },
          { id: "J-partial", finalStatus: "partial" },
          { id: "J-insufficient", finalStatus: "insufficient-evidence" },
        ],
      }),
    );
    writeFileSync(
      secondReportPath,
      JSON.stringify({
        judgements: [
          { id: "J-unfulfilled", finalStatus: "unfulfilled" },
          { id: "J-suspicious", finalStatus: "suspicious-fake-implementation" },
          { id: "J-extra", finalStatus: "extra-scope" },
        ],
      }),
    );

    const firstBefore = readFileSync(firstReportPath, "utf8");
    const secondBefore = readFileSync(secondReportPath, "utf8");
    const coverage = await extractStatusCoverage([firstReportPath, secondReportPath]);

    expect(coverage).toEqual({
      fulfilled: [{ judgementId: "J-fulfilled", report: firstReportPath }],
      partial: [{ judgementId: "J-partial", report: firstReportPath }],
      "insufficient-evidence": [{ judgementId: "J-insufficient", report: firstReportPath }],
      unfulfilled: [{ judgementId: "J-unfulfilled", report: secondReportPath }],
      "suspicious-fake-implementation": [{ judgementId: "J-suspicious", report: secondReportPath }],
      "extra-scope": [{ judgementId: "J-extra", report: secondReportPath }],
    });
    expect(readFileSync(firstReportPath, "utf8")).toBe(firstBefore);
    expect(readFileSync(secondReportPath, "utf8")).toBe(secondBefore);
  });

  it("rejects report artifacts that do not cover every final status", async () => {
    const directory = createDirectory();
    const reportPath = path.join(directory, "incomplete-report.json");
    writeFileSync(
      reportPath,
      JSON.stringify({ judgements: [{ id: "J-fulfilled", finalStatus: "fulfilled" }] }),
    );

    await expect(extractStatusCoverage([reportPath])).rejects.toThrow(
      "Combined reports do not cover final status: partial",
    );
  });

  it("rejects a missing report path", async () => {
    const directory = createDirectory();
    await expect(
      extractStatusCoverage([path.join(directory, "missing-report.json")]),
    ).rejects.toThrow("Unable to read report JSON");
  });

  it("rejects malformed report JSON", async () => {
    const directory = createDirectory();
    const reportPath = path.join(directory, "malformed.json");
    writeFileSync(reportPath, "not json\n");
    await expect(extractStatusCoverage([reportPath])).rejects.toThrow("Unable to read report JSON");
  });
});
