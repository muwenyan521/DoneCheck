import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const root = process.cwd();
const sourceRoots = ["packages", "apps"];

const packageByDir = new Map([
  ["packages/shared", "shared"],
  ["packages/core", "core"],
  ["packages/templates", "templates"],
  ["packages/report-ui", "report-ui"],
  ["packages/config", "config"],
  ["apps/cli", "cli"],
  ["apps/desktop", "desktop"],
]);

// Runtime @donecheck/* imports allowed per package.
const allowedRuntimeImports = new Map([
  ["shared", new Set()],
  ["core", new Set(["shared"])],
  ["templates", new Set()],
  ["report-ui", new Set()],
  ["config", new Set()],
  ["cli", new Set(["core"])],
  ["desktop", new Set(["core", "shared"])],
]);

// Type-only @donecheck/* imports allowed per package.
// report-ui may use `import type` from shared, but never a runtime import.
const allowedTypeOnlyImports = new Map([
  ["shared", new Set()],
  ["core", new Set(["shared"])],
  ["templates", new Set()],
  ["report-ui", new Set(["shared"])],
  ["config", new Set()],
  ["cli", new Set(["core", "shared"])],
  ["desktop", new Set(["core", "shared"])],
]);

// Native modules: only apps/desktop may declare them, and only in dependencies.
const nativeModules = new Set(["better-sqlite3"]);
const packagesAllowedNative = new Set(["desktop"]);

const sourceFileExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const donecheckImportPattern = /^@donecheck\/([a-z-]+)$/;
const failures = [];

function packageForFile(filePath) {
  const relative = path.relative(root, filePath);
  for (const [directory, packageName] of packageByDir.entries()) {
    if (relative === directory || relative.startsWith(`${directory}${path.sep}`)) {
      return packageName;
    }
  }
  return undefined;
}

function isTestFile(filePath) {
  const basename = path.basename(filePath);
  return basename.includes(".test.") || basename.includes(".spec.");
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "dist" && entry.name !== "node_modules" && entry.name !== ".cache") {
        files.push(...(await collectFiles(entryPath)));
      }
      continue;
    }
    if (sourceFileExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

/**
 * Determine whether an ImportDeclaration is purely type-only.
 *
 * - `import type { X } from "..."`        → type-only
 * - `import { type X } from "..."`         → type-only (all specifiers are type)
 * - `import { type X, Y } from "..."`      → runtime (Y is a runtime binding)
 * - `import X from "..."`                  → runtime (default binding)
 * - `import * as X from "..."`             → runtime (namespace binding)
 * - `import "..."`                          → runtime (side-effect)
 */
function isImportDeclarationTypeOnly(node) {
  const clause = node.importClause;
  if (!clause) return false; // side-effect import → runtime
  if (clause.isTypeOnly) return true;
  if (clause.name) return false; // default import → runtime
  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamedImports(bindings)) {
    if (bindings.elements.length === 0) return false;
    return bindings.elements.every((spec) => spec.isTypeOnly);
  }
  return false; // namespace import → runtime
}

/**
 * Parse a source file with the TypeScript compiler and extract every
 * @donecheck/* reference, classifying it as "type" or "runtime".
 *
 * Covers:
 *  - static `import` / `import type`
 *  - `export ... from` re-exports
 *  - dynamic `import("@donecheck/...")`
 *  - `require("@donecheck/...")`
 */
function extractDonecheckReferences(filePath, content) {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const refs = [];

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (ts.isStringLiteral(specifier)) {
        const match = specifier.text.match(donecheckImportPattern);
        if (match) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          refs.push({
            name: match[1],
            kind: isImportDeclarationTypeOnly(node) ? "type" : "runtime",
            file: filePath,
            line: line + 1,
            syntax: "import",
          });
        }
      }
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const match = node.moduleSpecifier.text.match(donecheckImportPattern);
      if (match) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        refs.push({
          name: match[1],
          kind: node.isTypeOnly ? "type" : "runtime",
          file: filePath,
          line: line + 1,
          syntax: "export-from",
        });
      }
    }

    // Dynamic import(): always runtime.
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        const match = arg.text.match(donecheckImportPattern);
        if (match) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          refs.push({
            name: match[1],
            kind: "runtime",
            file: filePath,
            line: line + 1,
            syntax: "dynamic-import",
          });
        }
      }
    }

    // require("..."): always runtime.
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require"
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        const match = arg.text.match(donecheckImportPattern);
        if (match) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          refs.push({
            name: match[1],
            kind: "runtime",
            file: filePath,
            line: line + 1,
            syntax: "require",
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return refs;
}

async function checkSourceFiles() {
  for (const sourceRoot of sourceRoots) {
    const absoluteSourceRoot = path.join(root, sourceRoot);
    const files = await collectFiles(absoluteSourceRoot).catch(() => []);

    for (const file of files) {
      const owner = packageForFile(file);
      if (!owner) continue;

      const content = await readFile(file, "utf8");
      const refs = extractDonecheckReferences(file, content);
      const runtimeAllowed = allowedRuntimeImports.get(owner) ?? new Set();
      const typeOnlyAllowed = allowedTypeOnlyImports.get(owner) ?? new Set();

      for (const ref of refs) {
        // @donecheck/config is a build-time config package, not subject to
        // runtime boundary rules.
        if (ref.name === "config" || ref.name === owner) continue;

        if (owner === "cli" && ref.name === "shared" && isTestFile(ref.file)) continue;

        if (ref.kind === "runtime" && !runtimeAllowed.has(ref.name)) {
          failures.push(
            `${path.relative(root, ref.file)}:${ref.line} → ${owner} runtime-imports @donecheck/${ref.name} (${ref.syntax}); allowed runtime: [${[...runtimeAllowed].join(", ") || "none"}]`,
          );
        } else if (ref.kind === "type" && !typeOnlyAllowed.has(ref.name)) {
          failures.push(
            `${path.relative(root, ref.file)}:${ref.line} → ${owner} type-only-imports @donecheck/${ref.name}; allowed type-only: [${[...typeOnlyAllowed].join(", ") || "none"}]`,
          );
        }
      }
    }
  }
}

async function checkPackageManifests() {
  for (const [packageDir, packageName] of packageByDir.entries()) {
    const manifestPath = path.join(root, packageDir, "package.json");
    const content = await readFile(manifestPath, "utf8").catch(() => null);
    if (!content) continue;

    const pkg = JSON.parse(content);
    const runtimeAllowed = allowedRuntimeImports.get(packageName) ?? new Set();
    const typeOnlyAllowed = allowedTypeOnlyImports.get(packageName) ?? new Set();
    const manifestRel = path.relative(root, manifestPath);

    for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
      const deps = pkg[section] ?? {};
      for (const depName of Object.keys(deps)) {
        const match = depName.match(donecheckImportPattern);
        if (match) {
          const depPackage = match[1];
          if (depPackage === "config" || depPackage === packageName) continue;

          if (section === "dependencies") {
            // Declaring a @donecheck/* package in `dependencies` means a
            // runtime relationship: it must be in the runtime allow-list.
            if (!runtimeAllowed.has(depPackage)) {
              failures.push(
                `${manifestRel}: ${packageName} declares @donecheck/${depPackage} in dependencies (runtime), but runtime import is not allowed`,
              );
            }
          } else {
            // devDependencies / peerDependencies may carry type-only
            // relationships (e.g. report-ui peer-depends on shared for types).
            if (!runtimeAllowed.has(depPackage) && !typeOnlyAllowed.has(depPackage)) {
              failures.push(
                `${manifestRel}: ${packageName} declares @donecheck/${depPackage} in ${section}, but neither runtime nor type-only import is allowed`,
              );
            }
          }
        }

        // Native modules: only desktop, and only in dependencies.
        if (nativeModules.has(depName)) {
          if (!packagesAllowedNative.has(packageName)) {
            failures.push(
              `${manifestRel}: ${packageName} declares native dependency ${depName} in ${section}; native modules are only allowed in apps/desktop`,
            );
          }
          if (section !== "dependencies") {
            failures.push(
              `${manifestRel}: native dependency ${depName} must live in dependencies, found in ${section}`,
            );
          }
        }
      }
    }

    // templates must be a zero-runtime-dependency leaf package.
    if (packageName === "templates") {
      const deps = pkg.dependencies ?? {};
      if (Object.keys(deps).length > 0) {
        failures.push(
          `${manifestRel}: templates must have zero runtime dependencies (Option A policy), found: ${Object.keys(deps).join(", ")}`,
        );
      }
    }
  }
}

await checkSourceFiles();
await checkPackageManifests();

if (failures.length > 0) {
  console.error("Dependency boundary violations:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("Dependency boundaries passed.");
