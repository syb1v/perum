import * as SQLite from 'expo-sqlite';
import { registerAccountLocalDataRemover } from '../query/persistence';
import type { SupportOutboxStore } from './outboxCore';
import type { SupportMutation } from './types';

let database: Promise<SQLite.SQLiteDatabase> | null = null;

async function db() {
  if (!database) database = SQLite.openDatabaseAsync('perum-mobile.db').then(async (value) => {
    await value.execAsync("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS support_outbox (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, ticket_id TEXT NOT NULL, client_message_id TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL, error TEXT, created_at INTEGER NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS support_outbox_client_id ON support_outbox(account_id, client_message_id); CREATE INDEX IF NOT EXISTS support_outbox_account ON support_outbox(account_id, created_at, id); CREATE INDEX IF NOT EXISTS support_outbox_ticket ON support_outbox(account_id, ticket_id, created_at, id);");
    return value;
  });
  return database;
}

function fromRow(row: Record<string, string | number | null>): SupportMutation {
  return { id: String(row.id), accountId: String(row.account_id), ticketId: String(row.ticket_id), clientMessageId: String(row.client_message_id), body: String(row.body), state: row.state as SupportMutation['state'], attempts: Number(row.attempts), nextAttemptAt: Number(row.next_attempt_at), error: row.error === null ? null : String(row.error), createdAt: Number(row.created_at) };
}

export const sqliteSupportOutbox: SupportOutboxStore = {
  async recover() { await (await db()).runAsync("UPDATE support_outbox SET state = 'pending' WHERE state = 'sending'"); },
  async getRunnable(accountId, now) {
    const row = await (await db()).getFirstAsync<Record<string, string | number | null>>("SELECT item.* FROM support_outbox item WHERE item.account_id = ? AND (item.state = 'pending' OR (item.state = 'retry_wait' AND item.next_attempt_at <= ?)) AND NOT EXISTS (SELECT 1 FROM support_outbox previous WHERE previous.account_id = item.account_id AND previous.ticket_id = item.ticket_id AND (previous.created_at < item.created_at OR (previous.created_at = item.created_at AND previous.id < item.id))) ORDER BY item.created_at, item.id LIMIT 1", accountId, now);
    return row ? fromRow(row) : null;
  },
  async getByAccount(accountId) { return (await (await db()).getAllAsync<Record<string, string | number | null>>('SELECT * FROM support_outbox WHERE account_id = ? ORDER BY created_at, id', accountId)).map(fromRow); },
  async put(item) { await (await db()).runAsync('INSERT OR REPLACE INTO support_outbox VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.accountId, item.ticketId, item.clientMessageId, item.body, item.state, item.attempts, item.nextAttemptAt, item.error, item.createdAt); },
  async remove(id) { await (await db()).runAsync('DELETE FROM support_outbox WHERE id = ?', id); },
  async removeAccount(accountId) { await (await db()).runAsync('DELETE FROM support_outbox WHERE account_id = ?', accountId); },
};

registerAccountLocalDataRemover((accountId) => sqliteSupportOutbox.removeAccount(accountId));
