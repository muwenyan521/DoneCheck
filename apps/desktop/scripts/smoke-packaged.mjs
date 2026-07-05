import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { extractFile, listPackage } from "@electron/asar";

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
  const asarFile = findAsarFile(files, releaseDir);
  if (!asarFile || !nonEmpty(asarFile)) {
    return false;
  }
  const entries = listPackage(asarFile);
  const normalized = entry.startsWith("/") ? entry : `/${entry}`;
  return entries.includes(normalized);
}

function findAsarFile(files, releaseDir) {
  return files.find((file) => path.relative(releaseDir, file).endsWith("resources/app.asar"));
}

function readPackagedFile(files, releaseDir, relativeFiles, entry) {
  const unpackedFile = files.find((_file, index) => relativeFiles[index].endsWith(entry));
  if (unpackedFile && nonEmpty(unpackedFile)) {
    return readFileSync(unpackedFile, "utf8");
  }

  const asarFile = findAsarFile(files, releaseDir);
  if (!asarFile || !nonEmpty(asarFile)) {
    return undefined;
  }

  const normalized = entry.startsWith("/") ? entry.slice(1) : entry;
  try {
    return extractFile(asarFile, normalized).toString("utf8");
  } catch {
    return undefined;
  }
}

function extractRendererAssetPaths(html) {
  const paths = [];
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    paths.push(match[1]);
  }
  for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    paths.push(match[1]);
  }
  return paths;
}

function checkRendererAssetPaths(lines, files, releaseDir, relativeFiles) {
  const html = readPackagedFile(files, releaseDir, relativeFiles, "dist/renderer/index.html");
  if (html === undefined) {
    lines.push("FAIL renderer asset paths cannot be checked without index.html");
    return false;
  }

  let ok = true;
  for (const assetPath of extractRendererAssetPaths(html)) {
    if (assetPath.startsWith("/")) {
      lines.push(`FAIL renderer asset path is absolute: ${assetPath}`);
      ok = false;
    } else if (/^https?:\/\//i.test(assetPath)) {
      lines.push(`FAIL renderer asset path is remote: ${assetPath}`);
      ok = false;
    }
  }

  if (ok) {
    lines.push("PASS renderer asset paths are relative");
  }
  return ok;
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

  const hasAppImage = hasFile(files, (file) => file.endsWith(".AppImage"));
  if (hasAppImage) {
    ok = check(lines, true, "AppImage found") && ok;
  } else {
    lines.push("SKIP AppImage not found (dir-only packaging)");
  }

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
        hasAsarEntry(files, releaseDir, "dist/electron.cjs"),
      "main found",
    ) && ok;
  ok =
    check(
      lines,
      relativeFiles.some((file) => file.endsWith("dist/preload.cjs")) ||
        hasAsarEntry(files, releaseDir, "dist/preload.cjs"),
      "preload found",
    ) && ok;
  ok =
    check(
      lines,
      relativeFiles.some((file) => file.endsWith("dist/renderer/index.html")) ||
        hasAsarEntry(files, releaseDir, "dist/renderer/index.html"),
      "renderer found",
    ) && ok;
  ok = checkRendererAssetPaths(lines, files, releaseDir, relativeFiles) && ok;
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
