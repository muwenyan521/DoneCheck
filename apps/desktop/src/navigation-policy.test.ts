import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isAllowedRendererNavigation } from "./navigation-policy.js";

describe("renderer navigation policy", () => {
  const entry = pathToFileURL(resolve("dist/renderer/index.html")).href;

  it.each([entry, pathToFileURL(resolve("dist/renderer/assets/index.js")).href, `${entry}#report`])(
    "allows packaged renderer content under its own directory: %s",
    (target) => {
      expect(isAllowedRendererNavigation(target, entry)).toBe(true);
    },
  );

  it.each([
    pathToFileURL(resolve("../outside.html")).href,
    "file:///etc/passwd",
    "https://example.com/",
    "javascript:alert(1)",
  ])("rejects navigation outside the packaged renderer: %s", (target) => {
    expect(isAllowedRendererNavigation(target, entry)).toBe(false);
  });

  it("allows only the configured development origin", () => {
    const devEntry = "http://127.0.0.1:5173/index.html";
    expect(isAllowedRendererNavigation("http://127.0.0.1:5173/assets/app.js", devEntry)).toBe(true);
    expect(isAllowedRendererNavigation("http://localhost:5173/index.html", devEntry)).toBe(false);
    expect(isAllowedRendererNavigation("https://127.0.0.1:5173/index.html", devEntry)).toBe(false);
  });
});
