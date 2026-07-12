import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type {
  HistoryDeleteRequest,
  HistoryEntry,
  HistoryRestoreRequest,
  HistorySaveRequest,
  HistorySummary,
} from "./ipc-contract.js";

export interface HistoryStoreOptions {
  readonly databasePath: string;
}

export interface HistoryStore {
  list(): readonly HistorySummary[];
  get(request: { readonly id: string }): HistoryEntry | undefined;
  save(request: HistorySaveRequest): HistoryEntry;
  delete(request: HistoryDeleteRequest): { readonly deleted: boolean };
  restore(request: HistoryRestoreRequest): { readonly restored: boolean };
  clear(): { readonly cleared: number };
  close(): void;
}

interface HistoryRow {
  readonly id: string;
  readonly created_at: string;
  readonly workspace_dir: string;
  readonly requirement_summary: string;
  readonly report_json: string;
  readonly fingerprint: string;
}

const summaryMaxLength = 160;
const maxHistoryEntries = 50;

export function createHistoryStore(options: HistoryStoreOptions): HistoryStore {
  const db = new Database(options.databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS history_entries (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      workspace_dir TEXT NOT NULL,
      requirement_summary TEXT NOT NULL,
      report_json TEXT NOT NULL,
      fingerprint TEXT,
      deleted_at TEXT
    )
  `);
  migrateHistorySchema(db);

  return {
    clear: () => {
      const result = db.prepare("DELETE FROM history_entries").run();
      return { cleared: result.changes };
    },
    close: () => db.close(),
    delete: (request) => {
      const result = db
        .prepare("UPDATE history_entries SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
        .run(new Date().toISOString(), request.id);
      return { deleted: result.changes > 0 };
    },
    get: (request) => {
      const row = db
        .prepare("SELECT * FROM history_entries WHERE id = ? AND deleted_at IS NULL")
        .get(request.id) as HistoryRow | undefined;
      return row === undefined ? undefined : rowToEntry(row);
    },
    list: () =>
      (
        db
          .prepare(
            "SELECT id, created_at, workspace_dir, requirement_summary, report_json, fingerprint FROM history_entries WHERE deleted_at IS NULL ORDER BY created_at DESC",
          )
          .all() as HistoryRow[]
      ).map(rowToSummary),
    save: (request) => {
      const reportJson = JSON.stringify(request.report);
      const fingerprint = createFingerprint(request, reportJson);
      const existing = db
        .prepare("SELECT * FROM history_entries WHERE fingerprint = ?")
        .get(fingerprint) as HistoryRow | undefined;
      if (existing !== undefined) {
        db.prepare("UPDATE history_entries SET deleted_at = NULL WHERE id = ?").run(existing.id);
        return rowToEntry(existing);
      }
      const entry: HistoryEntry = {
        createdAt: new Date().toISOString(),
        id: randomUUID(),
        report: request.report,
        requirementSummary: summarizeRequirement(request.requirement),
        workspaceDir: request.workspaceDir,
      };
      db.prepare(
        "INSERT INTO history_entries (id, created_at, workspace_dir, requirement_summary, report_json, fingerprint, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)",
      ).run(
        entry.id,
        entry.createdAt,
        entry.workspaceDir,
        entry.requirementSummary,
        reportJson,
        fingerprint,
      );
      db.prepare(
        "DELETE FROM history_entries WHERE id NOT IN (SELECT id FROM history_entries ORDER BY created_at DESC LIMIT ?)",
      ).run(maxHistoryEntries);
      return entry;
    },
    restore: (request) => {
      const result = db
        .prepare(
          "UPDATE history_entries SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL",
        )
        .run(request.id);
      return { restored: result.changes > 0 };
    },
  };
}

function migrateHistorySchema(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(history_entries)").all() as Array<{
    readonly name: string;
  }>;
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("fingerprint")) db.exec("ALTER TABLE history_entries ADD COLUMN fingerprint TEXT");
  if (!names.has("deleted_at")) db.exec("ALTER TABLE history_entries ADD COLUMN deleted_at TEXT");
  const rows = db
    .prepare(
      "SELECT id, workspace_dir, requirement_summary, report_json FROM history_entries WHERE fingerprint IS NULL",
    )
    .all() as Array<{
    readonly id: string;
    readonly workspace_dir: string;
    readonly requirement_summary: string;
    readonly report_json: string;
  }>;
  const update = db.prepare("UPDATE history_entries SET fingerprint = ? WHERE id = ?");
  for (const row of rows) {
    update.run(
      hashText(`${row.workspace_dir}\u0000${row.requirement_summary}\u0000${row.report_json}`),
      row.id,
    );
  }
  db.exec("CREATE INDEX IF NOT EXISTS history_entries_fingerprint ON history_entries(fingerprint)");
}

function createFingerprint(request: HistorySaveRequest, reportJson: string): string {
  return hashText(
    `${request.workspaceDir.trim()}\u0000${summarizeRequirement(request.requirement)}\u0000${reportJson}`,
  );
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function summarizeRequirement(requirement: string): string {
  const normalized = requirement.trim().replace(/\s+/gu, " ");
  if (normalized.length <= summaryMaxLength) return normalized;
  return `${normalized.slice(0, summaryMaxLength - 1)}…`;
}

function rowToSummary(row: HistoryRow): HistorySummary {
  return {
    createdAt: row.created_at,
    id: row.id,
    requirementSummary: row.requirement_summary,
    workspaceDir: row.workspace_dir,
  };
}

function rowToEntry(row: HistoryRow): HistoryEntry {
  return {
    ...rowToSummary(row),
    report: JSON.parse(row.report_json) as HistoryEntry["report"],
  };
}
