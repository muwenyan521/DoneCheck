import { describe, expect, it } from "vitest";
import { assertAllowedIpcSender, assertValidIpcArguments } from "./ipc-boundary.js";

describe("desktop IPC boundary", () => {
  const entry = "file:///app/renderer/index.html";

  it("accepts the configured renderer and rejects other senders", () => {
    expect(() => assertAllowedIpcSender({ senderFrame: { url: entry } }, entry)).not.toThrow();
    expect(() =>
      assertAllowedIpcSender({ senderFrame: { url: "file:///etc/passwd" } }, entry),
    ).toThrow(/source/iu);
    expect(() => assertAllowedIpcSender({}, entry)).toThrow(/source/iu);
  });

  it("rejects payloads on no-request channels", () => {
    expect(() => assertValidIpcArguments("donecheck:history:list", [])).not.toThrow();
    expect(() => assertValidIpcArguments("donecheck:history:list", [undefined])).toThrow();
  });

  it("rejects unknown fields and oversized analysis input", () => {
    const valid = { requestId: "request-1", workspaceDir: "/tmp/project", requirement: "works" };
    expect(() => assertValidIpcArguments("donecheck:decompose", [valid])).not.toThrow();
    expect(() =>
      assertValidIpcArguments("donecheck:decompose", [{ ...valid, unexpected: true }]),
    ).toThrow(/unsupported/iu);
    expect(() =>
      assertValidIpcArguments("donecheck:decompose", [
        { ...valid, requirement: "x".repeat(200_001) },
      ]),
    ).toThrow(/length/iu);
  });

  it("limits clipboard content and report size", () => {
    expect(() =>
      assertValidIpcArguments("donecheck:clipboard:copy-repair-prompt", [
        { text: "x".repeat(2 * 1024 * 1024 + 1) },
      ]),
    ).toThrow(/length/iu);
    expect(() =>
      assertValidIpcArguments("donecheck:render-html", [
        { report: { content: "x".repeat(10 * 1024 * 1024 + 1) } },
      ]),
    ).toThrow(/large/iu);
  });

  it("rejects export file names containing paths", () => {
    expect(() =>
      assertValidIpcArguments("donecheck:export-html", [
        { defaultFileName: "../../report.html", report: {} },
      ]),
    ).toThrow(/file name/iu);
  });
});
