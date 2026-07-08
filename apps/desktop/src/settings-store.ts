import Database from "better-sqlite3";
import type { Database as DatabaseConnection } from "better-sqlite3";
import {
  type DesktopSettings,
  type DesktopSettingsPatch,
  defaultDesktopSettings,
} from "./settings-model.js";

export type { DesktopSettings, DesktopSettingsPatch, ProviderMode } from "./settings-model.js";
export { defaultDesktopSettings } from "./settings-model.js";

export interface SettingsStoreOptions {
  readonly databasePath?: string;
  readonly database?: DatabaseConnection;
}

export interface SettingsStore {
  get(): DesktopSettings;
  set(patch: DesktopSettingsPatch): DesktopSettings;
  reset(): DesktopSettings;
  close(): void;
}

interface SettingsRow {
  readonly key: string;
  readonly value_json: string;
}

const settingKeys = Object.keys(defaultDesktopSettings) as (keyof DesktopSettings)[];
const maxRecentWorkspaces = 5;

export function createSettingsStore(options: SettingsStoreOptions): SettingsStore {
  const db = options.database ?? new Database(options.databasePath ?? ":memory:");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    )
  `);

  return {
    close: () => db.close(),
    get: () => readSettings(db),
    reset: () => {
      db.prepare("DELETE FROM app_settings").run();
      return defaultDesktopSettings;
    },
    set: (patch) => {
      const next = normalizeSettings({ ...readSettings(db), ...patch });
      const statement = db.prepare(
        "INSERT INTO app_settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
      );
      const transaction = db.transaction(() => {
        for (const key of settingKeys) {
          statement.run(key, JSON.stringify(next[key]));
        }
      });
      transaction();
      return next;
    },
  };
}

function readSettings(db: DatabaseConnection): DesktopSettings {
  const rows = db.prepare("SELECT key, value_json FROM app_settings").all() as SettingsRow[];
  const values: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      values[row.key] = JSON.parse(row.value_json) as unknown;
    } catch {
      values[row.key] = undefined;
    }
  }
  return normalizeSettings({ ...defaultDesktopSettings, ...values });
}

function normalizeSettings(value: Record<string, unknown>): DesktopSettings {
  return {
    autoSaveHistory: readBoolean(value.autoSaveHistory, defaultDesktopSettings.autoSaveHistory),
    confirmRequirementDecomposition: readBoolean(
      value.confirmRequirementDecomposition,
      defaultDesktopSettings.confirmRequirementDecomposition,
    ),
    defaultWorkspaceDir: readNullableString(value.defaultWorkspaceDir),
    ignore: normalizeStringList(value.ignore, Number.POSITIVE_INFINITY),
    locale:
      value.locale === "en" || value.locale === "zh-CN"
        ? value.locale
        : defaultDesktopSettings.locale,
    providerBaseUrl: readString(value.providerBaseUrl, defaultDesktopSettings.providerBaseUrl),
    providerMode:
      value.providerMode === "mock" || value.providerMode === "openai-compatible"
        ? value.providerMode
        : defaultDesktopSettings.providerMode,
    providerModel: readString(value.providerModel, defaultDesktopSettings.providerModel),
    recentWorkspaces: normalizeStringList(value.recentWorkspaces, maxRecentWorkspaces),
    reopenLastWorkspace: readBoolean(
      value.reopenLastWorkspace,
      defaultDesktopSettings.reopenLastWorkspace,
    ),
    showDebugSections: readBoolean(
      value.showDebugSections,
      defaultDesktopSettings.showDebugSections,
    ),
    structuredOutputStrict: readBoolean(
      value.structuredOutputStrict,
      defaultDesktopSettings.structuredOutputStrict,
    ),
    templateId:
      value.templateId === "generic" ||
      value.templateId === "todo" ||
      value.templateId === "frontend"
        ? value.templateId
        : defaultDesktopSettings.templateId,
    topK: readPositiveInteger(value.topK, defaultDesktopSettings.topK),
  };
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeStringList(value: unknown, limit: number): readonly string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= limit) break;
  }
  return result;
}
