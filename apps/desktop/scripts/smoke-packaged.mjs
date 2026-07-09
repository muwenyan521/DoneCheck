import { spawn } from "node:child_process";
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
  const lines = ["Artifact structure smoke."];
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

export function evaluateGuiSmokeResult(payload) {
  if (payload === undefined || payload === null) {
    return { ok: false, lines: ["FAIL packaged gui smoke ready file missing"] };
  }
  let parsed = payload;
  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch {
      return { ok: false, lines: ["FAIL packaged gui smoke ready file not json"] };
    }
  }
  const ok =
    parsed?.ok === true && parsed?.rendererLoaded === true && parsed?.nativeStorage === true;
  const lines = [
    `${ok ? "PASS" : "FAIL"} packaged gui smoke`,
    `  rendererLoaded=${parsed?.rendererLoaded}`,
    `  nativeStorage=${parsed?.nativeStorage}`,
    parsed?.error ? `  error=${parsed.error}` : null,
  ].filter(Boolean);
  return { ok, lines, parsed };
}

export function findUnpackedExecutable(releaseDir, platform = "linux") {
  const dir = platform === "win" ? "win-unpacked" : "linux-unpacked";
  const unpacked = path.join(releaseDir, dir);
  if (!existsSync(unpacked)) return undefined;
  const exeName = platform === "win" ? "DoneCheck Desktop.exe" : "donecheck-desktop";
  const exe = path.join(unpacked, exeName);
  return existsSync(exe) ? exe : undefined;
}

export async function runPackagedGuiSmoke({
  releaseDir,
  platform = "linux",
  timeoutMs = 30000,
  spawn: spawnFn = spawn,
  env = process.env,
}) {
  const exe = findUnpackedExecutable(releaseDir, platform);
  if (!exe) {
    return {
      ok: false,
      lines: [`FAIL no unpacked executable found for ${platform} gui smoke`],
    };
  }
  const readyFile = path.join(releaseDir, `gui-smoke-ready-${process.pid}.json`);
  const storageFile = path.join(releaseDir, `gui-smoke-${process.pid}.sqlite`);
  const childEnv = {
    ...env,
    DONECHECK_GUI_SMOKE: "1",
    DONECHECK_GUI_SMOKE_READY_FILE: readyFile,
    DONECHECK_GUI_SMOKE_STORAGE_FILE: storageFile,
  };
  const child = spawnFn(exe, ["--no-sandbox"], { env: childEnv, stdio: "pipe" });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (d) => {
    stdout += d;
  });
  child.stderr?.on("data", (d) => {
    stderr += d;
  });

  const exited = new Promise((resolve) => {
    child.on("exit", (code) => resolve({ kind: "exit", code }));
  });
  const timer = new Promise((resolve) => setTimeout(() => resolve({ kind: "timeout" }), timeoutMs));
  const outcome = await Promise.race([exited, timer]);

  if (outcome.kind === "timeout") {
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
    return {
      ok: false,
      lines: [
        `FAIL packaged gui smoke timed out after ${timeoutMs}ms`,
        `  stderr=${stderr.slice(-500)}`,
      ],
      stdout,
      stderr,
    };
  }

  const content = existsSync(readyFile) ? readFileSync(readyFile, "utf8") : undefined;
  const result = evaluateGuiSmokeResult(content);
  const lines = [...result.lines];
  if (content === undefined || result.ok === false) {
    lines.push(
      `  child exitCode=${outcome.code}`,
      `  stderr=${stderr.slice(-800) || "(empty)"}`,
      `  stdout=${stdout.slice(-400) || "(empty)"}`,
    );
  }
  return {
    ok: result.ok,
    lines,
    stdout,
    stderr,
    ready: result.parsed,
    exitCode: outcome.code,
  };
}

export async function runFullPackagedSmoke({
  releaseDir = path.resolve("release"),
  platform = "linux",
  runGui = true,
  spawn: spawnFn = spawn,
  env = process.env,
} = {}) {
  const lines = [
    runGui
      ? "Packaged smoke: structure + real GUI launch (unpacks and spawns the app)."
      : "Packaged smoke: structure only; this does not launch the packaged GUI.",
  ];
  const structure = inspectPackagedArtifacts(releaseDir);
  lines.push(...structure.lines);
  let ok = structure.ok;

  if (runGui) {
    if (!ok) {
      lines.push("SKIP packaged gui smoke because structure smoke failed");
    } else {
      const gui = await runPackagedGuiSmoke({ releaseDir, platform, spawn: spawnFn, env });
      lines.push(...gui.lines);
      ok = ok && gui.ok;
    }
  }

  lines.push(
    `${ok ? "PASS" : "FAIL"} packaged smoke ${ok ? "passed" : "failed"} (structure${runGui ? " + gui" : ""})`,
  );
  return { ok, lines, structure, gui: runGui };
}

function parseCliArgs(argv) {
  const args = { structureOnly: false, platform: "linux", releaseDir: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--structure-only") args.structureOnly = true;
    else if (a === "--gui") args.structureOnly = false;
    else if (a === "--platform") args.platform = argv[++i];
    else if (!a.startsWith("--")) args.releaseDir = a;
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseCliArgs(process.argv.slice(2));
  const releaseDir = args.releaseDir ? path.resolve(args.releaseDir) : path.resolve("release");
  runFullPackagedSmoke({
    releaseDir,
    platform: args.platform,
    runGui: !args.structureOnly,
  })
    .then((result) => {
      for (const line of result.lines) console.log(line);
      process.exitCode = result.ok ? 0 : 1;
    })
    .catch((error) => {
      console.error("packaged smoke runner crashed", error);
      process.exitCode = 1;
    });
}
