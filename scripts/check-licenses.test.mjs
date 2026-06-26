import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findForbiddenLicenses,
  forbiddenLicensePattern,
  reportViolations,
} from "./check-licenses.mjs";

describe("forbiddenLicensePattern", () => {
  it("matches AGPL and GPL variants", () => {
    expect(forbiddenLicensePattern.test("AGPL-3.0")).toBe(true);
    expect(forbiddenLicensePattern.test("AGPL-3.0-or-later")).toBe(true);
    expect(forbiddenLicensePattern.test("GPL-2.0")).toBe(true);
    expect(forbiddenLicensePattern.test("GPL-3.0")).toBe(true);
    expect(forbiddenLicensePattern.test("GPL-3.0-or-later")).toBe(true);
  });

  it("does not match permissive licenses", () => {
    expect(forbiddenLicensePattern.test("MIT")).toBe(false);
    expect(forbiddenLicensePattern.test("Apache-2.0")).toBe(false);
    expect(forbiddenLicensePattern.test("MPL-2.0")).toBe(false);
    expect(forbiddenLicensePattern.test("ISC")).toBe(false);
    expect(forbiddenLicensePattern.test("BSD-3-Clause")).toBe(false);
  });
});

describe("findForbiddenLicenses (unit)", () => {
  it("returns only AGPL/GPL packages from a mixed package map", () => {
    const packages = {
      "agpl-pkg@1.0.0": { licenses: "AGPL-3.0" },
      "gpl-pkg@1.0.0": { licenses: "GPL-3.0" },
      "mit-pkg@1.0.0": { licenses: "MIT" },
      "apache-pkg@1.0.0": { licenses: "Apache-2.0" },
      "mpl-pkg@1.0.0": { licenses: "MPL-2.0" },
    };
    const violations = findForbiddenLicenses(packages);
    expect(violations).toHaveLength(2);
    expect(violations[0][0]).toBe("agpl-pkg@1.0.0");
    expect(violations[1][0]).toBe("gpl-pkg@1.0.0");
  });

  it("returns nothing for an all-permissive package map", () => {
    const packages = {
      "mit-pkg@1.0.0": { licenses: "MIT" },
      "apache-pkg@1.0.0": { licenses: "Apache-2.0" },
      "mpl-pkg@1.0.0": { licenses: "MPL-2.0" },
    };
    expect(findForbiddenLicenses(packages)).toHaveLength(0);
  });
});

describe("reportViolations (unit)", () => {
  it("returns exit code 1 when violations exist", () => {
    expect(reportViolations([["evil-gpl@1.0.0", { licenses: "GPL-3.0" }]])).toBe(1);
  });

  it("returns exit code 0 when there are no violations", () => {
    expect(reportViolations([])).toBe(0);
  });
});

/**
 * Integration tests: build a real fixture directory with a fake
 * node_modules entry whose package.json declares a given license, then run
 * the actual `check-licenses.mjs` script against it and assert the exit code.
 */
function createLicenseFixture(license) {
  const dir = mkdtempSync(path.join(tmpdir(), "donecheck-license-"));
  mkdirSync(path.join(dir, "node_modules", "fixture-pkg"), { recursive: true });
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "fixture-root",
      version: "0.0.0",
      license: "MIT",
      dependencies: { "fixture-pkg": "1.0.0" },
    }),
  );
  writeFileSync(
    path.join(dir, "node_modules", "fixture-pkg", "package.json"),
    JSON.stringify({
      name: "fixture-pkg",
      version: "1.0.0",
      license,
    }),
  );
  return dir;
}

function runLicenseScript(startDir) {
  try {
    execFileSync("node", ["scripts/check-licenses.mjs", "--start", startDir], {
      stdio: "pipe",
    });
    return 0;
  } catch (error) {
    return error.status ?? 1;
  }
}

describe("check-licenses integration (real fixture → exit code)", () => {
  it("exits 1 when an AGPL dependency is present", () => {
    const dir = createLicenseFixture("AGPL-3.0");
    try {
      expect(runLicenseScript(dir)).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 1 when a GPL dependency is present", () => {
    const dir = createLicenseFixture("GPL-3.0");
    try {
      expect(runLicenseScript(dir)).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 0 when only MIT/Apache/MPL dependencies are present", () => {
    const dir = createLicenseFixture("MIT");
    try {
      expect(runLicenseScript(dir)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 0 when an Apache-2.0 dependency is present", () => {
    const dir = createLicenseFixture("Apache-2.0");
    try {
      expect(runLicenseScript(dir)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits 0 when an MPL-2.0 dependency is present", () => {
    const dir = createLicenseFixture("MPL-2.0");
    try {
      expect(runLicenseScript(dir)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
