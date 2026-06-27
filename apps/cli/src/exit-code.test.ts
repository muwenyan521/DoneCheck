import { describe, expect, it } from "vitest";
import { exitCodeForResult, toolErrorExitCode } from "./exit-code.js";

describe("exit codes", () => {
  it("maps pass to success", () => {
    expect(exitCodeForResult("pass", false)).toBe(0);
  });

  it("maps fail to check failure", () => {
    expect(exitCodeForResult("fail", false)).toBe(1);
  });

  it("maps partial to check failure by default", () => {
    expect(exitCodeForResult("partial", false)).toBe(1);
  });

  it("maps partial to success when partial-ok is enabled", () => {
    expect(exitCodeForResult("partial", true)).toBe(0);
  });

  it("uses exit code 2 for tool errors", () => {
    expect(toolErrorExitCode).toBe(2);
  });
});
