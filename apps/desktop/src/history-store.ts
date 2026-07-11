import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type {
  HistoryDeleteRequest,
  HistoryEntry,
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
  close(): void;
}

interface HistoryRow {
  readonly id: string;
  readonly created_at: string;
  readonly workspace_dir: string;
  readonly requirement_summary: string;
  readonly report_json: string;
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
      report_json TEXT NOT NULL
    )
  `);

  return {
    close: () => db.close(),
    delete: (request) => {
      const result = db.prepare("DELETE FROM history_entries WHERE id = ?").run(request.id);
      return { deleted: result.changes > 0 };
    },
    get: (request) => {
      const row = db.prepare("SELECT * FROM history_entries WHERE id = ?").get(request.id) as
        | HistoryRow
        | undefined;
      return row === undefined ? undefined : rowToEntry(row);
    },
    list: () =>
      (
        db
          .prepare(
            "SELECT id, created_at, workspace_dir, requirement_summary, report_json FROM history_entries ORDER BY created_at DESC",
          )
          .all() as HistoryRow[]
      ).map(rowToSummary),
    save: (request) => {
      const entry: HistoryEntry = {
        createdAt: new Date().toISOString(),
        id: randomUUID(),
        report: request.report,
        requirementSummary: summarizeRequirement(request.requirement),
        workspaceDir: request.workspaceDir,
      };
      db.prepare(
        "INSERT INTO history_entries (id, created_at, workspace_dir, requirement_summary, report_json) VALUES (?, ?, ?, ?, ?)",
      ).run(
        entry.id,
        entry.createdAt,
        entry.workspaceDir,
        entry.requirementSummary,
        JSON.stringify(entry.report),
      );
      db.prepare(
        "DELETE FROM history_entries WHERE id NOT IN (SELECT id FROM history_entries ORDER BY created_at DESC LIMIT ?)",
      ).run(maxHistoryEntries);
      return entry;
    },
  };
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
