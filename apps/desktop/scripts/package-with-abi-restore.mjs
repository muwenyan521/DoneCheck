import { spawnSync } from "node:child_process";
import process from "node:process";

const targets = new Map([
  ["dir", "dist:dir"],
  ["linux", "dist:linux"],
  ["win", "dist:win"],
]);

export function pnpmCommand(platform = process.platform) {
  return platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function runPnpmScript(script, runner, platform) {
  const command = pnpmCommand(platform);
  const result = runner(command, [script]);
  if (result.error) {
    console.error(`Failed to spawn ${command} ${script}: ${result.error.message}`);
    return 1;
  }
  if (result.status === null) {
    console.error(
      `${command} ${script} exited without a status code (signal=${result.signal ?? "none"})`,
    );
    return 1;
  }
  return result.status;
}

export function runPackageWithAbiRestore(
  args = process.argv.slice(2),
  runner = spawnSync,
  options = {},
) {
  const platform = options.platform ?? process.platform;
  const target = args[0];
  const packageScript = targets.get(target);

  if (!packageScript) {
    console.error("Usage: node scripts/package-with-abi-restore.mjs <dir|linux|win>");
    return 1;
  }

  let exitCode = 0;
  let shouldRestore = false;

  try {
    for (const script of ["build", "electron:rebuild", packageScript]) {
      if (script === "electron:rebuild") {
        shouldRestore = true;
      }
      const status = runPnpmScript(script, runner, platform);
      if (status !== 0) {
        console.error(`Command failed: pnpm ${script}`);
        exitCode = status;
        break;
      }
    }
  } finally {
    if (shouldRestore) {
      const restoreStatus = runPnpmScript("rebuild:node", runner, platform);
      if (restoreStatus !== 0) {
        console.error("Failed to restore better-sqlite3 to Node ABI: pnpm rebuild:node");
        exitCode = restoreStatus;
      }
    }
  }

  return exitCode;
}

export function createDefaultRunner() {
  if (process.platform === "win32") {
    const comspec = process.env.ComSpec || "cmd.exe";
    let diagnosed = false;
    return (command, args) => {
      if (!diagnosed) {
        diagnosed = true;
        console.error("[package-with-abi-restore] win32 diagnostic:");
        console.error(`  ComSpec=${comspec}`);
        console.error(`  node=${process.execPath}`);
        const where = spawnSync(comspec, ["/c", "where", "pnpm.cmd"], { encoding: "utf8" });
        console.error(
          `  where pnpm.cmd: ${where.stdout?.trim() || where.stderr?.trim() || "not found"} (status=${where.status})`,
        );
        const ver = spawnSync(comspec, ["/c", "pnpm.cmd", "--version"], { encoding: "utf8" });
        console.error(
          `  pnpm.cmd --version: stdout=${ver.stdout?.trim() || "(empty)"} stderr=${ver.stderr?.trim() || "(empty)"} status=${ver.status}`,
        );
      }
      console.error(
        `[package-with-abi-restore] spawning: ${comspec} /d /s /c ${command} ${args.join(" ")}`,
      );
      const result = spawnSync(comspec, ["/d", "/s", "/c", command, ...args], {
        stdio: "inherit",
      });
      console.error(
        `[package-with-abi-restore] result: status=${result.status} signal=${result.signal} error=${result.error?.message ?? "none"}`,
      );
      return result;
    };
  }
  return (command, args) => spawnSync(command, args, { stdio: "inherit" });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runPackageWithAbiRestore(process.argv.slice(2), createDefaultRunner());
}
