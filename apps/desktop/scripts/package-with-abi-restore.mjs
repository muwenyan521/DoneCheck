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

if (import.meta.url === `file://${process.argv[1]}`) {
  const isWin = process.platform === "win32";
  process.exitCode = runPackageWithAbiRestore(process.argv.slice(2), (command, args) =>
    spawnSync(command, args, { stdio: "inherit", shell: isWin }),
  );
}
