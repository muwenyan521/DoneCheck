import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { Database as DatabaseConnection } from "better-sqlite3";
import type { ProviderMode } from "./settings-model.js";

export const bundledFreeDailyLimit = 3;

export interface BundledFreeQuotaStatus {
  readonly limit: number;
  readonly localDate: string;
  readonly remaining: number;
  readonly resetsAt: string;
  readonly used: number;
}

export interface BundledFreeQuotaClock {
  now(): Date;
}

export interface BundledFreeQuotaStore {
  close(): void;
  reserve():
    | { readonly ok: true; readonly status: BundledFreeQuotaStatus }
    | {
        readonly ok: false;
        readonly status: BundledFreeQuotaStatus;
      };
  status(): BundledFreeQuotaStatus;
}

export interface CreateBundledFreeQuotaStoreOptions {
  readonly clock?: BundledFreeQuotaClock;
  readonly database?: DatabaseConnection;
  readonly databasePath?: string;
}

interface QuotaRow {
  readonly used: number;
}

export function createBundledFreeQuotaStore(
  options: CreateBundledFreeQuotaStoreOptions,
): BundledFreeQuotaStore {
  const db = options.database ?? new Database(options.databasePath ?? ":memory:");
  const clock = options.clock ?? { now: () => new Date() };
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 2000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS bundled_free_quota (
      local_date TEXT PRIMARY KEY NOT NULL,
      used INTEGER NOT NULL CHECK (used >= 0 AND used <= ${bundledFreeDailyLimit})
    )
  `);
  const reserveTransaction = db.transaction((localDate: string): boolean => {
    db.prepare(
      `INSERT INTO bundled_free_quota (local_date, used) VALUES (?, 0)
       ON CONFLICT(local_date) DO NOTHING`,
    ).run(localDate);
    const result = db
      .prepare("UPDATE bundled_free_quota SET used = used + 1 WHERE local_date = ? AND used < ?")
      .run(localDate, bundledFreeDailyLimit);
    return result.changes === 1;
  });

  return {
    close: () => db.close(),
    reserve: () => {
      const now = clock.now();
      const localDate = toLocalDate(now);
      const ok = reserveTransaction.immediate(localDate);
      return { ok, status: readStatus(db, now) };
    },
    status: () => readStatus(db, clock.now()),
  };
}

export type BundledFreeWorkflowStage = "decomposed" | "reserved" | "terminal";

export interface BundledFreeWorkflowBinding {
  readonly ignore: readonly string[];
  readonly providerMode: ProviderMode;
  readonly requestId: string;
  readonly workspaceDir: string;
}

export interface BundledFreeWorkflowReservation extends BundledFreeWorkflowBinding {
  readonly localDate: string;
  readonly stage: BundledFreeWorkflowStage;
  readonly token: string;
}

export interface BundledFreeWorkflowManager {
  cancelByRequestId(requestId: string): void;
  consumeAnalyze(
    token: string,
    binding: BundledFreeWorkflowBinding,
  ): BundledFreeWorkflowReservation;
  consumeDecompose(
    token: string,
    binding: BundledFreeWorkflowBinding,
  ): BundledFreeWorkflowReservation;
  reserve(binding: BundledFreeWorkflowBinding): {
    readonly status: BundledFreeQuotaStatus;
    readonly token: string;
  };
}

export class BundledFreeQuotaExhaustedError extends Error {
  override readonly name = "BundledFreeQuotaExhaustedError";
}

export class BundledFreeWorkflowError extends Error {
  override readonly name = "BundledFreeWorkflowError";
}

export function createBundledFreeWorkflowManager(
  quotaStore: BundledFreeQuotaStore,
): BundledFreeWorkflowManager {
  const reservations = new Map<string, BundledFreeWorkflowReservation>();
  return {
    cancelByRequestId: (requestId) => {
      for (const [token, reservation] of reservations) {
        if (reservation.requestId === requestId) {
          reservations.set(token, { ...reservation, stage: "terminal" });
        }
      }
    },
    consumeAnalyze: (token, binding) =>
      transitionReservation(reservations, token, binding, "decomposed", "terminal"),
    consumeDecompose: (token, binding) =>
      transitionReservation(reservations, token, binding, "reserved", "decomposed"),
    reserve: (binding) => {
      const result = quotaStore.reserve();
      if (!result.ok)
        throw new BundledFreeQuotaExhaustedError("Daily free analysis limit reached.");
      const token = randomUUID();
      reservations.set(token, {
        ...normalizeBinding(binding),
        localDate: result.status.localDate,
        stage: "reserved",
        token,
      });
      return { status: result.status, token };
    },
  };
}

function transitionReservation(
  reservations: Map<string, BundledFreeWorkflowReservation>,
  token: string,
  binding: BundledFreeWorkflowBinding,
  expected: BundledFreeWorkflowStage,
  next: BundledFreeWorkflowStage,
): BundledFreeWorkflowReservation {
  const reservation = reservations.get(token);
  if (reservation === undefined || reservation.stage !== expected) {
    throw new BundledFreeWorkflowError("The free analysis workflow is invalid or already used.");
  }
  const normalized = normalizeBinding(binding);
  if (!sameBinding(reservation, normalized)) {
    reservations.set(token, { ...reservation, stage: "terminal" });
    throw new BundledFreeWorkflowError("The free analysis workflow does not match this request.");
  }
  const transitioned = { ...reservation, stage: next };
  reservations.set(token, transitioned);
  return transitioned;
}

function normalizeBinding(binding: BundledFreeWorkflowBinding): BundledFreeWorkflowBinding {
  return {
    ignore: [...new Set(binding.ignore.map((value) => value.trim()).filter(Boolean))].sort(),
    providerMode: binding.providerMode,
    requestId: binding.requestId.trim(),
    workspaceDir: binding.workspaceDir.trim(),
  };
}

function sameBinding(left: BundledFreeWorkflowBinding, right: BundledFreeWorkflowBinding): boolean {
  return (
    left.providerMode === right.providerMode &&
    left.requestId === right.requestId &&
    left.workspaceDir === right.workspaceDir &&
    left.ignore.length === right.ignore.length &&
    left.ignore.every((value, index) => value === right.ignore[index])
  );
}

function readStatus(db: DatabaseConnection, now: Date): BundledFreeQuotaStatus {
  const localDate = toLocalDate(now);
  const row = db
    .prepare("SELECT used FROM bundled_free_quota WHERE local_date = ?")
    .get(localDate) as QuotaRow | undefined;
  const used = row?.used ?? 0;
  return {
    limit: bundledFreeDailyLimit,
    localDate,
    remaining: Math.max(0, bundledFreeDailyLimit - used),
    resetsAt: nextLocalMidnight(now).toISOString(),
    used,
  };
}

function toLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}
