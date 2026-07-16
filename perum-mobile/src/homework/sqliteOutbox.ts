import * as SQLite from 'expo-sqlite';
import { registerAccountLocalDataRemover } from '../query/persistence';
import type { HomeworkStore } from './outboxCore';
import type { HomeworkMutation } from './types';

let database: Promise<SQLite.SQLiteDatabase> | null = null;
async function db() { if (!database) database = SQLite.openDatabaseAsync('perum-mobile.db').then(async value => { await value.execAsync("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS homework_outbox (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, homework_id INTEGER NOT NULL, client_action_id TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL, error TEXT, created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS homework_outbox_account ON homework_outbox(account_id, created_at, id);"); return value; }); return database; }
function row(value: Record<string, string | number | null>): HomeworkMutation { return { id: String(value.id), accountId: String(value.account_id), homeworkId: Number(value.homework_id), clientActionId: String(value.client_action_id), version: Number(value.version), status: String(value.status) as HomeworkMutation['status'], state: String(value.state) as HomeworkMutation['state'], attempts: Number(value.attempts), nextAttemptAt: Number(value.next_attempt_at), error: value.error === null ? null : String(value.error), createdAt: Number(value.created_at) }; }
export const sqliteHomeworkOutbox: HomeworkStore = {
  async recover() { await (await db()).runAsync("UPDATE homework_outbox SET state = 'pending' WHERE state = 'sending'"); },
  async getRunnable(accountId, now) { const value = await (await db()).getFirstAsync<Record<string, string | number | null>>("SELECT * FROM homework_outbox WHERE account_id = ? AND (state = 'pending' OR (state = 'retry_wait' AND next_attempt_at <= ?)) ORDER BY created_at, id LIMIT 1", accountId, now); return value ? row(value) : null; },
  async getByAccount(accountId) { return (await (await db()).getAllAsync<Record<string, string | number | null>>('SELECT * FROM homework_outbox WHERE account_id = ? ORDER BY created_at, id', accountId)).map(row); },
  async put(item) { await (await db()).runAsync('INSERT OR REPLACE INTO homework_outbox VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.accountId, item.homeworkId, item.clientActionId, item.version, item.status, item.state, item.attempts, item.nextAttemptAt, item.error, item.createdAt); },
  async remove(id) { await (await db()).runAsync('DELETE FROM homework_outbox WHERE id = ?', id); }, async removeAccount(accountId) { await (await db()).runAsync('DELETE FROM homework_outbox WHERE account_id = ?', accountId); },
};
registerAccountLocalDataRemover(accountId => sqliteHomeworkOutbox.removeAccount(accountId));
