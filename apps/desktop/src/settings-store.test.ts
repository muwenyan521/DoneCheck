import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  createSettingsStore,
  defaultDesktopSettings,
  normalizeProviderBaseUrl,
} from "./settings-store.js";

describe("settings store", () => {
  it("returns defaults when no settings exist", () => {
    const store = createSettingsStore({ databasePath: ":memory:" });

    expect(store.get()).toEqual(defaultDesktopSettings);

    store.close();
  });

  it("sets, gets, persists, and resets non-sensitive settings", () => {
    const db = new Database(":memory:");
    const store = createSettingsStore({ database: db });
    const updated = store.set({
      autoSaveHistory: false,
      defaultWorkspaceDir: "/workspace/demo",
      ignore: ["node_modules", "dist"],
      locale: "en",
      providerBaseUrl: "https://compatible.example/v1",
      providerMode: "openai-compatible",
      providerModel: "compatible-model",
      recentWorkspaces: ["/workspace/demo", "/workspace/other"],
      templateId: "todo",
      topK: 7,
    });

    expect(updated).toEqual({
      ...defaultDesktopSettings,
      autoSaveHistory: false,
      defaultWorkspaceDir: "/workspace/demo",
      ignore: ["node_modules", "dist"],
      locale: "en",
      providerBaseUrl: "https://compatible.example/v1",
      providerMode: "openai-compatible",
      providerModel: "compatible-model",
      recentWorkspaces: ["/workspace/demo", "/workspace/other"],
      templateId: "todo",
      topK: 7,
    });

    const reopened = createSettingsStore({ database: db });
    expect(reopened.get()).toEqual(updated);
    expect(
      db.prepare("SELECT value_json FROM app_settings WHERE key = ?").get("providerModel"),
    ).toEqual({ value_json: JSON.stringify("compatible-model") });
    expect(JSON.stringify(db.prepare("SELECT * FROM app_settings").all())).not.toContain("sk-");

    expect(reopened.reset()).toEqual(defaultDesktopSettings);
    expect(reopened.get()).toEqual(defaultDesktopSettings);

    store.close();
  });

  it("normalizes ignore and recent workspace lists", () => {
    const store = createSettingsStore({ databasePath: ":memory:" });

    expect(
      store.set({
        ignore: ["", "dist", "node_modules", "dist", "  coverage  "],
        recentWorkspaces: ["/a", "/b", "/a", "/c", "/d", "/e", "/f"],
      }),
    ).toEqual({
      ...defaultDesktopSettings,
      ignore: ["dist", "node_modules", "coverage"],
      recentWorkspaces: ["/a", "/b", "/c", "/d", "/e"],
    });

    store.close();
  });

  it("falls back to defaults when persisted values are invalid", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)");
    db.prepare("INSERT INTO app_settings (key, value_json) VALUES (?, ?)").run(
      "topK",
      JSON.stringify("not-a-number"),
    );
    const store = createSettingsStore({ database: db });

    expect(store.get()).toEqual(defaultDesktopSettings);

    store.close();
  });

  it("defaults and resets to bundled free analysis while preserving explicit legacy modes", () => {
    const db = new Database(":memory:");
    const store = createSettingsStore({ database: db });

    expect(store.get().providerMode).toBe("bundled-free");
    expect(store.set({ providerMode: "mock" }).providerMode).toBe("mock");
    expect(store.set({ providerMode: "openai-compatible" }).providerMode).toBe("openai-compatible");
    expect(store.reset().providerMode).toBe("bundled-free");

    store.close();
  });

  it("normalizes an unknown persisted provider mode to bundled free analysis", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)");
    db.prepare("INSERT INTO app_settings (key, value_json) VALUES (?, ?)").run(
      "providerMode",
      JSON.stringify("removed-mode"),
    );
    const store = createSettingsStore({ database: db });

    expect(store.get().providerMode).toBe("bundled-free");

    store.close();
  });

  it.each([
    ["", ""],
    [" https://compatible.example/v1/ ", "https://compatible.example/v1"],
    ["http://localhost:11434/v1/", "http://localhost:11434/v1"],
    ["http://127.8.9.10:8080/v1", "http://127.8.9.10:8080/v1"],
    ["http://[::1]:8080/v1", "http://[::1]:8080/v1"],
  ])("accepts a safe online analysis address %s", (input, expected) => {
    expect(normalizeProviderBaseUrl(input)).toBe(expected);
  });

  it.each([
    "http://compatible.example/v1",
    "https://user:password@compatible.example/v1",
    "ftp://compatible.example/v1",
    "not a url",
  ])("rejects an unsafe online analysis address %s without persisting it", (providerBaseUrl) => {
    const store = createSettingsStore({ databasePath: ":memory:" });
    expect(() => store.set({ providerBaseUrl })).toThrow(/online analysis address/iu);
    expect(store.get().providerBaseUrl).toBe("");
    store.close();
  });
});
