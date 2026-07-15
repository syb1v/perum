import * as SQLite from 'expo-sqlite';
import { registerAccountLocalDataRemover } from '../query/persistence';
import type { MessageOutboxStore } from './outboxCore';
import type { MessageMutation } from './types';

let database: Promise<SQLite.SQLiteDatabase> | null = null;

async function db() {
  if (!database) database = SQLite.openDatabaseAsync('perum-mobile.db').then(async (value) => {
    await value.execAsync("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS message_outbox (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, conversation_id INTEGER NOT NULL, client_message_id TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL, error TEXT, created_at INTEGER NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS message_outbox_client_id ON message_outbox(account_id, client_message_id); CREATE INDEX IF NOT EXISTS message_outbox_account ON message_outbox(account_id, created_at, id);");
    return value;
  });
  return database;
}

function fromRow(row: Record<string, string | number | null>): MessageMutation {
  return { id: String(row.id), accountId: String(row.account_id), conversationId: Number(row.conversation_id), clientMessageId: String(row.client_message_id), body: String(row.body), state: row.state as MessageMutation['state'], attempts: Number(row.attempts), nextAttemptAt: Number(row.next_attempt_at), error: row.error === null ? null : String(row.error), createdAt: Number(row.created_at) };
}

export const sqliteMessageOutbox: MessageOutboxStore = {
  async recover() { await (await db()).runAsync("UPDATE message_outbox SET state = 'pending' WHERE state = 'sending'"); },
  async getRunnable(accountId, now) {
    const row = await (await db()).getFirstAsync<Record<string, string | number | null>>("SELECT * FROM message_outbox WHERE account_id = ? AND (state = 'pending' OR (state = 'retry_wait' AND next_attempt_at <= ?)) ORDER BY created_at, id LIMIT 1", accountId, now);
    return row ? fromRow(row) : null;
  },
  async getByAccount(accountId) {
    const rows = await (await db()).getAllAsync<Record<string, string | number | null>>('SELECT * FROM message_outbox WHERE account_id = ? ORDER BY created_at, id', accountId);
    return rows.map(fromRow);
  },
  async put(item) { await (await db()).runAsync('INSERT OR REPLACE INTO message_outbox VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.accountId, item.conversationId, item.clientMessageId, item.body, item.state, item.attempts, item.nextAttemptAt, item.error, item.createdAt); },
  async remove(id) { await (await db()).runAsync('DELETE FROM message_outbox WHERE id = ?', id); },
  async removeAccount(accountId) { await (await db()).runAsync('DELETE FROM message_outbox WHERE account_id = ?', accountId); },
};

registerAccountLocalDataRemover((accountId) => sqliteMessageOutbox.removeAccount(accountId));
