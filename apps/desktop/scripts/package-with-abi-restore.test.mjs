import { describe, expect, it } from "vitest";
import { runPackageWithAbiRestore } from "./package-with-abi-restore.mjs";

function createRecorder(failures = {}) {
  const calls = [];
  return {
    calls,
    runner(command, args) {
      calls.push([command, ...args].join(" "));
      const key = [command, ...args].join(" ");
      return { status: failures[key] ?? 0 };
    },
  };
}

describe("package-with-abi-restore", () => {
  it("runs build, Electron rebuild, dir package, and Node rebuild in order", () => {
    const recorder = createRecorder();
    const result = runPackageWithAbiRestore(["dir"], recorder.runner);

    expect(result).toBe(0);
    expect(recorder.calls).toEqual([
      "pnpm build",
      "pnpm electron:rebuild",
      "pnpm dist:dir",
      "pnpm rebuild:node",
    ]);
  });

  it("returns non-zero for unsupported package targets without running commands", () => {
    const recorder = createRecorder();
    const result = runPackageWithAbiRestore(["mac"], recorder.runner);

    expect(result).toBe(1);
    expect(recorder.calls).toEqual([]);
  });

  it("still restores Node ABI when Linux packaging fails", () => {
    const recorder = createRecorder({ "pnpm dist:linux": 7 });
    const result = runPackageWithAbiRestore(["linux"], recorder.runner);

    expect(result).toBe(7);
    expect(recorder.calls).toEqual([
      "pnpm build",
      "pnpm electron:rebuild",
      "pnpm dist:linux",
      "pnpm rebuild:node",
    ]);
  });

  it("returns non-zero when Node ABI restoration fails after successful packaging", () => {
    const recorder = createRecorder({ "pnpm rebuild:node": 9 });
    const result = runPackageWithAbiRestore(["win"], recorder.runner);

    expect(result).toBe(9);
    expect(recorder.calls).toEqual([
      "pnpm build",
      "pnpm electron:rebuild",
      "pnpm dist:win",
      "pnpm rebuild:node",
    ]);
  });
});
