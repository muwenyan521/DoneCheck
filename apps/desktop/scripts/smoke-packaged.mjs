import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function walkFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }
  return files;
}

function nonEmpty(file) {
  return existsSync(file) && statSync(file).size > 0;
}

function hasFile(files, predicate) {
  return files.some((file) => predicate(file) && nonEmpty(file));
}

function hasAsarEntry(files, releaseDir, entry) {
  const asarFile = files.find((file) =>
    path.relative(releaseDir, file).endsWith("resources/app.asar"),
  );
  if (!asarFile || !nonEmpty(asarFile)) {
    return false;
  }
  const content = readFileSync(asarFile, "utf8");
  return content.includes(entry);
}

function check(lines, condition, label) {
  lines.push(`${condition ? "PASS" : "FAIL"} ${label}`);
  return condition;
}

export function inspectPackagedArtifacts(releaseDir = path.resolve("release")) {
  const lines = ["Artifact structure smoke only; this does not launch the packaged GUI."];
  if (!existsSync(releaseDir)) {
    lines.push(`FAIL release directory missing: ${releaseDir}`);
    return { ok: false, lines };
  }

  let ok = true;
  const files = walkFiles(releaseDir);
  const relativeFiles = files.map((file) =>
    path.relative(releaseDir, file).split(path.sep).join("/"),
  );

  ok = check(lines, true, "release directory found") && ok;
  ok = check(lines, files.length > 0, "release contains files") && ok;
  ok =
    check(
      lines,
      hasFile(files, (file) => file.endsWith(".AppImage")),
      "AppImage found",
    ) && ok;
  ok =
    check(
      lines,
      relativeFiles.some((file) => file.includes("-unpacked/")),
      "unpacked app found",
    ) && ok;
  ok =
    check(
      lines,
      relativeFiles.some((file) => file.endsWith("dist/electron.cjs")) ||
        hasAsarEntry(files, releaseDir, "electron.cjs"),
      "main found",
    ) && ok;
  ok =
    check(
      lines,
      relativeFiles.some((file) => file.endsWith("dist/preload.cjs")) ||
        hasAsarEntry(files, releaseDir, "preload.cjs"),
      "preload found",
    ) && ok;
  ok =
    check(
      lines,
      relativeFiles.some((file) => file.endsWith("dist/renderer/index.html")) ||
        hasAsarEntry(files, releaseDir, "index.html"),
      "renderer found",
    ) && ok;
  ok =
    check(
      lines,
      hasFile(files, (file) => file.endsWith(".node")),
      "native module found",
    ) && ok;
  ok =
    check(
      lines,
      hasFile(files, (file) => path.basename(file).includes("better_sqlite3")),
      "better_sqlite3 native module found",
    ) && ok;

  lines.push(`${ok ? "PASS" : "FAIL"} artifact structure smoke ${ok ? "passed" : "failed"}`);
  return { ok, lines };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = inspectPackagedArtifacts(
    process.argv[2] ? path.resolve(process.argv[2]) : undefined,
  );
  for (const line of result.lines) {
    console.log(line);
  }
  process.exitCode = result.ok ? 0 : 1;
}
