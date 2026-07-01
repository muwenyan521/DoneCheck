import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const packageJsonPath = path.join(repoRoot, "apps/cli/package.json");
const productionSourceFiles = [
  path.join(repoRoot, "apps/cli/src/args.ts"),
  path.join(repoRoot, "apps/cli/src/exit-code.ts"),
  path.join(repoRoot, "apps/cli/src/index.ts"),
  path.join(repoRoot, "apps/cli/src/input.ts"),
  path.join(repoRoot, "apps/cli/src/output.ts"),
  path.join(repoRoot, "apps/cli/src/provider-factory.ts"),
  path.join(repoRoot, "apps/cli/src/rules-output.ts"),
];

describe("dist dependency boundary", () => {
  it("keeps @donecheck/shared out of CLI production dependencies", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).toEqual({
      "@donecheck/core": "workspace:*",
      "@donecheck/provider-openai": "workspace:*",
      "@donecheck/report-ui": "workspace:*",
      "@donecheck/templates": "workspace:*",
      react: "catalog:",
      "react-dom": "catalog:",
    });
  });

  it("keeps @donecheck/shared out of CLI production source imports", () => {
    for (const file of productionSourceFiles) {
      expect(readFileSync(file, "utf8")).not.toMatch(
        /(?:from|import\s*\()\s*["']@donecheck\/shared["']/,
      );
    }
  });
});
