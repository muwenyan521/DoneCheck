import { spawnSync } from "node:child_process";
import process from "node:process";

const targets = new Map([
  ["dir", "dist:dir"],
  ["linux", "dist:linux"],
  ["win", "dist:win"],
]);

function runPnpmScript(script, runner) {
  const result = runner("pnpm", [script]);
  return typeof result.status === "number" ? result.status : 1;
}

export function runPackageWithAbiRestore(args = process.argv.slice(2), runner = spawnSync) {
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
      const status = runPnpmScript(script, runner);
      if (status !== 0) {
        console.error(`Command failed: pnpm ${script}`);
        exitCode = status;
        break;
      }
    }
  } finally {
    if (shouldRestore) {
      const restoreStatus = runPnpmScript("rebuild:node", runner);
      if (restoreStatus !== 0) {
        console.error("Failed to restore better-sqlite3 to Node ABI: pnpm rebuild:node");
        exitCode = restoreStatus;
      }
    }
  }

  return exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runPackageWithAbiRestore(process.argv.slice(2), (command, args) =>
    spawnSync(command, args, { stdio: "inherit" }),
  );
}
