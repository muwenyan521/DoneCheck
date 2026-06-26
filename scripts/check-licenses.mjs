import { createRequire } from "node:module";
import process from "node:process";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const checker = require("license-checker");

export const forbiddenLicensePattern = /\b(?:AGPL|GPL)\b/i;

/**
 * Filter a license-checker package map down to entries whose license
 * matches the forbidden copyleft pattern (AGPL / GPL).
 *
 * @param {Record<string, { licenses?: string }>} packages
 * @returns {Array<[string, { licenses?: string }]>}
 */
export function findForbiddenLicenses(packages) {
  return Object.entries(packages ?? {}).filter(([, metadata]) => {
    const license = String(metadata.licenses ?? "UNKNOWN");
    return forbiddenLicensePattern.test(license);
  });
}

/**
 * Print violations and return the process exit code (1 if any, 0 otherwise).
 */
export function reportViolations(violations) {
  if (violations.length > 0) {
    console.error("Forbidden copyleft licenses detected:");
    for (const [name, metadata] of violations) {
      console.error(`- ${name}: ${metadata.licenses}`);
    }
    return 1;
  }
  console.log("License check passed.");
  return 0;
}

// Auto-run only when executed as a script, not when imported by tests.
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  // `--start <dir>` lets integration tests point the scanner at a fixture
  // directory. Default is the current working directory.
  const startIdx = process.argv.indexOf("--start");
  const startDir = startIdx !== -1 ? process.argv[startIdx + 1] : process.cwd();

  checker.init({ production: false, start: startDir }, (error, packages) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    const violations = findForbiddenLicenses(packages);
    process.exit(reportViolations(violations));
  });
}
