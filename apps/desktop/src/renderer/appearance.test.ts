import { describe, expect, it } from "vitest";
import { defaultAppearance, parseAccentColor, parseThemeMode, resolveTheme } from "./appearance.js";

describe("appearance preferences", () => {
  it("defaults to the system color mode and DoneCheck blue accent", () => {
    expect(defaultAppearance).toEqual({ accent: "blue", mode: "system" });
  });

  it("accepts only supported persisted values", () => {
    expect(parseThemeMode("dark")).toBe("dark");
    expect(parseThemeMode("sepia")).toBe("system");
    expect(parseAccentColor("violet")).toBe("violet");
    expect(parseAccentColor("pink")).toBe("blue");
  });

  it("resolves system mode without overriding an explicit mode", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
