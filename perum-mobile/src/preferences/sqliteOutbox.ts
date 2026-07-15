import * as SQLite from 'expo-sqlite';
import { registerAccountLocalDataRemover } from '../query/persistence';
import type { OutboxStore } from './outboxCore';
import type { PreferencesMutation } from './types';

let database: Promise<SQLite.SQLiteDatabase> | null = null;

async function db() {
  if (!database) database = SQLite.openDatabaseAsync('perum-mobile.db').then(async (value) => {
    await value.execAsync("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS mutation_outbox (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, base_etag TEXT NOT NULL, idempotency_key TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL, conflict_current TEXT, error TEXT, created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS mutation_outbox_account ON mutation_outbox(account_id, created_at);");
    return value;
  });
  return database;
}

function fromRow(row: Record<string, string | number | null>): PreferencesMutation {
  return {
    id: String(row.id), accountId: String(row.account_id), kind: 'preferences', desired: JSON.parse(String(row.payload)).push_preview_enabled,
    baseEtag: String(row.base_etag), idempotencyKey: String(row.idempotency_key), state: row.state as PreferencesMutation['state'],
    attempts: Number(row.attempts), nextAttemptAt: Number(row.next_attempt_at), conflictCurrent: row.conflict_current ? JSON.parse(String(row.conflict_current)) : null,
    error: row.error === null ? null : String(row.error), createdAt: Number(row.created_at),
  };
}

export const sqliteOutbox: OutboxStore = {
  async recover() { await (await db()).runAsync("UPDATE mutation_outbox SET state = 'pending' WHERE state = 'sending'"); },
  async getRunnable(accountId, now) {
    const row = await (await db()).getFirstAsync<Record<string, string | number | null>>("SELECT * FROM mutation_outbox WHERE account_id = ? AND (state = 'pending' OR (state = 'retry_wait' AND next_attempt_at <= ?)) ORDER BY created_at LIMIT 1", accountId, now);
    return row ? fromRow(row) : null;
  },
  async getUnsent(accountId) {
    const row = await (await db()).getFirstAsync<Record<string, string | number | null>>("SELECT * FROM mutation_outbox WHERE account_id = ? AND state IN ('pending', 'retry_wait') ORDER BY created_at DESC LIMIT 1", accountId);
    return row ? fromRow(row) : null;
  },
  async getLatest(accountId) {
    const row = await (await db()).getFirstAsync<Record<string, string | number | null>>('SELECT * FROM mutation_outbox WHERE account_id = ? ORDER BY created_at DESC LIMIT 1', accountId);
    return row ? fromRow(row) : null;
  },
  async put(item) {
    await (await db()).runAsync('INSERT OR REPLACE INTO mutation_outbox VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.accountId, item.kind, JSON.stringify({ push_preview_enabled: item.desired }), item.baseEtag, item.idempotencyKey, item.state, item.attempts, item.nextAttemptAt, item.conflictCurrent ? JSON.stringify(item.conflictCurrent) : null, item.error, item.createdAt);
  },
  async remove(id) { await (await db()).runAsync('DELETE FROM mutation_outbox WHERE id = ?', id); },
  async removeAccount(accountId) { await (await db()).runAsync('DELETE FROM mutation_outbox WHERE account_id = ?', accountId); },
};

registerAccountLocalDataRemover((accountId) => sqliteOutbox.removeAccount(accountId));
