import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateSixStatusEvidence } from "./generate-six-status-evidence.mjs";

const directories = [];

function createDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "donecheck-six-status-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("generateSixStatusEvidence", () => {
  it("uses weak semantic evidence instead of a swallowed provider failure", async () => {
    const directory = createDirectory();
    const outputPath = path.join(directory, "six-status.json");
    const report = await generateSixStatusEvidence({ outputPath });
    const insufficient = report.judgements.find(
      (judgement) => judgement.sourceId === "REQ-INSUFFICIENT",
    );

    expect(insufficient).toMatchObject({
      finalStatus: "insufficient-evidence",
      reasonCode: "weak-or-unstable-evidence",
    });
    expect(report.summaryStats).toEqual({
      "extra-scope": 1,
      fulfilled: 1,
      "insufficient-evidence": 1,
      partial: 1,
      "suspicious-fake-implementation": 1,
      unfulfilled: 1,
    });
    expect(JSON.parse(readFileSync(outputPath, "utf8"))).toMatchObject({
      judgements: expect.arrayContaining([
        expect.objectContaining({
          finalStatus: "insufficient-evidence",
          reasonCode: "weak-or-unstable-evidence",
          sourceId: "REQ-INSUFFICIENT",
        }),
      ]),
    });
  });
});
