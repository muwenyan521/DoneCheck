import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const FINAL_STATUSES = [
  "fulfilled",
  "partial",
  "insufficient-evidence",
  "unfulfilled",
  "suspicious-fake-implementation",
  "extra-scope",
];

export async function extractStatusCoverage(reportPaths, outputPath) {
  const paths = typeof reportPaths === "string" ? [reportPaths] : reportPaths;
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error("At least one report path is required");
  }
  const reports = await Promise.all(
    paths.map(async (reportPath) => [reportPath, await readReport(reportPath)]),
  );
  const coverage = Object.fromEntries(FINAL_STATUSES.map((status) => [status, []]));

  for (const [reportPath, report] of reports) {
    for (const judgement of report.judgements) {
      coverage[judgement.finalStatus].push({ judgementId: judgement.id, report: reportPath });
    }
  }

  for (const status of FINAL_STATUSES) {
    if (coverage[status].length === 0) {
      throw new Error(`Combined reports do not cover final status: ${status}`);
    }
  }

  if (outputPath !== undefined) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(coverage, null, 2)}\n`, "utf8");
  }
  return coverage;
}

async function readReport(reportPath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(reportPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read report JSON at ${reportPath}: ${errorMessage(error)}`);
  }
  if (!isReport(parsed)) {
    throw new Error(`Invalid JudgementReport at ${reportPath}`);
  }
  return parsed;
}

function isReport(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray(value.judgements) &&
    value.judgements.every(
      (judgement) =>
        typeof judgement === "object" &&
        judgement !== null &&
        typeof judgement.id === "string" &&
        FINAL_STATUSES.includes(judgement.finalStatus),
    )
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  const reportPaths = outputIndex === -1 ? args : args.slice(0, outputIndex);
  const outputPath = outputIndex === -1 ? undefined : args[outputIndex + 1];
  if (
    reportPaths.length === 0 ||
    reportPaths.some((argument) => argument.trim().length === 0) ||
    (outputIndex !== -1 && (outputPath === undefined || outputPath.trim().length === 0))
  ) {
    throw new Error(
      "Usage: node scripts/extract-status-coverage.mjs <report.json> [<report.json> ...] [--output <status-coverage.json>]",
    );
  }
  const coverage = await extractStatusCoverage(reportPaths, outputPath);
  if (outputPath === undefined) process.stdout.write(`${JSON.stringify(coverage, null, 2)}\n`);
}
