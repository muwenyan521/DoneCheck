import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function runChecker() {
  return execFileSync("node", ["scripts/check-dependency-boundaries.mjs"], {
    cwd: root,
    stdio: "pipe",
  }).toString();
}

function runCheckerFailure() {
  try {
    runChecker();
  } catch (error) {
    if (isExecError(error)) {
      return `${error.stdout.toString()}${error.stderr.toString()}`;
    }
    throw error;
  }
  throw new Error("Expected dependency boundary checker to fail.");
}

function writeFixture(relativePath, content) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  return absolute;
}

function removeFixture(absolutePath) {
  rmSync(absolutePath, { force: true });
}

function isExecError(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "stdout" in error &&
    "stderr" in error &&
    Buffer.isBuffer(error.stdout) &&
    Buffer.isBuffer(error.stderr)
  );
}

describe("dependency boundary checker", () => {
  it("passes on a clean tree", () => {
    expect(runChecker()).toContain("Dependency boundaries passed.");
  });

  it("fails when templates runtime-imports @donecheck/core", () => {
    const fixture = writeFixture(
      "packages/templates/src/violation.ts",
      'import { analyze } from "@donecheck/core";\nexport const x = analyze;\n',
    );
    try {
      expect(() => runChecker()).toThrow();
    } finally {
      removeFixture(fixture);
    }
  });

  it("fails when cli runtime-imports @donecheck/shared", () => {
    const fixture = writeFixture(
      "apps/cli/src/runtime-shared-should-fail.ts",
      'import { parseDoneCheckResult } from "@donecheck/shared";\nexport const x = parseDoneCheckResult;\n',
    );
    try {
      expect(runCheckerFailure()).toContain("cli runtime-imports @donecheck/shared");
    } finally {
      removeFixture(fixture);
    }
  });

  it("fails when report-ui runtime-imports @donecheck/shared (non-type import)", () => {
    const fixture = writeFixture(
      "packages/report-ui/src/runtime-shared-should-fail.tsx",
      'import { doneCheckResultSchema } from "@donecheck/shared";\nexport const x = doneCheckResultSchema;\n',
    );
    try {
      expect(() => runChecker()).toThrow();
    } finally {
      removeFixture(fixture);
    }
  });

  it("fails when templates uses a dynamic import of @donecheck/core", () => {
    const fixture = writeFixture(
      "packages/templates/src/dynamic-should-fail.ts",
      'export const x = () => import("@donecheck/core");\n',
    );
    try {
      expect(() => runChecker()).toThrow();
    } finally {
      removeFixture(fixture);
    }
  });

  it("allows report-ui to use `import type` from @donecheck/shared", () => {
    // Positive test: type-only imports from shared are allowed in report-ui.
    const fixture = writeFixture(
      "packages/report-ui/src/type-only-allowed.tsx",
      'import type { DoneCheckResult } from "@donecheck/shared";\nexport type { DoneCheckResult };\n',
    );
    try {
      expect(runChecker()).toContain("Dependency boundaries passed.");
    } finally {
      removeFixture(fixture);
    }
  });

  it("allows templates to use `import type` from @donecheck/shared", () => {
    // Positive test: templates is a zero-runtime-dep leaf that reuses shared
    // type contracts via type-only imports.
    const fixture = writeFixture(
      "packages/templates/src/type-only-allowed.ts",
      'import type { ReportTemplate } from "@donecheck/shared";\nexport type { ReportTemplate };\n',
    );
    try {
      expect(runChecker()).toContain("Dependency boundaries passed.");
    } finally {
      removeFixture(fixture);
    }
  });

  it("allows provider-openai to use `import type` from @donecheck/core", () => {
    // Positive test: provider-openai reuses the LLMProvider contract from
    // core via type-only imports (zero runtime dep on core).
    const fixture = writeFixture(
      "packages/provider-openai/src/type-only-allowed.ts",
      'import type { LLMProvider } from "@donecheck/core";\nexport type { LLMProvider };\n',
    );
    try {
      expect(runChecker()).toContain("Dependency boundaries passed.");
    } finally {
      removeFixture(fixture);
    }
  });

  it("allows cli to runtime-import @donecheck/provider-openai, report-ui, templates", () => {
    // Positive test: CLI --rules/--html mode runtime-imports the real
    // OpenAI provider, the HTML report renderer, and the default template.
    const fixture = writeFixture(
      "apps/cli/src/rules-mode-allowed.ts",
      'import { OpenAIProvider } from "@donecheck/provider-openai";\nimport { createHtmlReportDocument } from "@donecheck/report-ui";\nimport { defaultTemplate } from "@donecheck/templates";\nexport const x = { OpenAIProvider, createHtmlReportDocument, defaultTemplate };\n',
    );
    try {
      expect(runChecker()).toContain("Dependency boundaries passed.");
    } finally {
      removeFixture(fixture);
    }
  });

  it("fails when provider-openai runtime-imports @donecheck/core", () => {
    const fixture = writeFixture(
      "packages/provider-openai/src/runtime-should-fail.ts",
      'import { analyze } from "@donecheck/core";\nexport const x = analyze;\n',
    );
    try {
      expect(() => runChecker()).toThrow();
    } finally {
      removeFixture(fixture);
    }
  });

  it("allows desktop to runtime-import @donecheck/provider-openai, report-ui, templates", () => {
    // Positive test: desktop Electron IPC runtime-imports the real OpenAI
    // provider, the HTML report renderer, and the default template.
    const fixture = writeFixture(
      "apps/desktop/src/ipc-allowed.ts",
      'import { createProvider } from "@donecheck/provider-openai";\nimport { createHtmlReportDocument } from "@donecheck/report-ui";\nimport { defaultTemplate } from "@donecheck/templates";\nexport const x = { createProvider, createHtmlReportDocument, defaultTemplate };\n',
    );
    try {
      expect(runChecker()).toContain("Dependency boundaries passed.");
    } finally {
      removeFixture(fixture);
    }
  });

  it("fails when templates uses `import { type X }` mixed with a runtime binding from @donecheck/core", () => {
    const fixture = writeFixture(
      "packages/templates/src/mixed-should-fail.ts",
      'import { type AnalyzeInput, analyze } from "@donecheck/core";\nexport const x = analyze;\n',
    );
    try {
      expect(() => runChecker()).toThrow();
    } finally {
      removeFixture(fixture);
    }
  });
});
