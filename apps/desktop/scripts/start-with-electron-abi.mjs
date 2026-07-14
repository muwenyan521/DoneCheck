import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ELECTRON_ARGS = ["--no-sandbox", "dist/electron.cjs"];

export function evaluateGuiSmokeReadyFile(content) {
  if (content === undefined || content === null) {
    return {
      ok: false,
      reason: "ready file missing",
      lines: ["FAIL gui smoke ready file missing"],
    };
  }
  let parsed;
  try {
    parsed = typeof content === "string" ? JSON.parse(content) : content;
  } catch {
    return {
      ok: false,
      reason: "ready file not json",
      lines: ["FAIL gui smoke ready file not json"],
    };
  }
  const ok =
    parsed?.ok === true && parsed?.rendererLoaded === true && parsed?.nativeStorage === true;
  const lines = [
    `${ok ? "PASS" : "FAIL"} gui smoke ready file`,
    `  rendererLoaded=${parsed?.rendererLoaded}`,
    `  nativeStorage=${parsed?.nativeStorage}`,
    parsed?.error ? `  error=${parsed.error}` : null,
  ].filter(Boolean);
  return {
    ok,
    reason: ok ? "ok" : (parsed?.error ?? "ready file indicates failure"),
    lines,
    parsed,
  };
}

export function runStartWithElectronAbi(
  args = process.argv.slice(2),
  runner = spawnSync,
  options = {},
) {
  const mode = args[0];
  if (mode !== "start" && mode !== "smoke") {
    console.error("Usage: node scripts/start-with-electron-abi.mjs <start|smoke>");
    return 1;
  }

  let exitCode = 0;
  let shouldRestore = false;
  let readyFile = options.readyFile;

  try {
    for (const step of ["build", "electron:rebuild"]) {
      const status = runScript(runner, step);
      if (status !== 0) {
        console.error(`Command failed: pnpm ${step}`);
        exitCode = status;
        break;
      }
      if (step === "electron:rebuild") shouldRestore = true;
    }

    if (exitCode === 0) {
      if (mode === "smoke" && !readyFile) {
        readyFile = path.join(
          process.env.TMPDIR ?? "/tmp",
          `donecheck-gui-smoke-${process.pid}.json`,
        );
      }
      const env =
        mode === "smoke"
          ? {
              ...process.env,
              DONECHECK_GUI_SMOKE: "1",
              DONECHECK_GUI_SMOKE_READY_FILE: readyFile,
            }
          : process.env;
      const status = runElectron(runner, env, mode);
      if (status !== 0) {
        console.error("Command failed: pnpm exec electron");
        exitCode = status;
      }

      if (mode === "smoke" && exitCode === 0) {
        const content = existsSync(readyFile) ? readFileSync(readyFile, "utf8") : undefined;
        const result = evaluateGuiSmokeReadyFile(content);
        for (const line of result.lines) console.log(line);
        if (!result.ok) exitCode = 1;
      }
    }
  } finally {
    if (shouldRestore) {
      const restoreStatus = runScript(runner, "rebuild:node");
      if (restoreStatus !== 0) {
        console.error("Failed to restore better-sqlite3 to Node ABI: pnpm rebuild:node");
        exitCode = restoreStatus;
      }
    }
  }

  return exitCode;
}

function runScript(runner, script) {
  const result = runner("pnpm", [script]);
  return typeof result.status === "number" ? result.status : 1;
}

function runElectron(runner, env, mode) {
  const args =
    mode === "smoke" ? ["--no-sandbox", "--disable-gpu", "dist/electron.cjs"] : ELECTRON_ARGS;
  const result = runner("pnpm", ["exec", "electron", ...args], { env });
  return typeof result.status === "number" ? result.status : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runStartWithElectronAbi(process.argv.slice(2), (command, args, opts) =>
    spawnSync(command, args, { stdio: "inherit", env: opts?.env }),
  );
}
