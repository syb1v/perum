import * as SQLite from 'expo-sqlite';
import { registerAccountLocalDataRemover } from '../query/persistence';
import type { SocialReadOutboxStore } from './readCursorOutboxCore';
import type { SocialReadMutation } from './types';

let database: Promise<SQLite.SQLiteDatabase> | null = null;

async function db() {
  if (!database) database = SQLite.openDatabaseAsync('perum-mobile.db').then(async (value) => {
    await value.execAsync("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS social_read_outbox (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, conversation_id INTEGER NOT NULL, message_id INTEGER NOT NULL, client_action_id TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL, error TEXT, created_at INTEGER NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS social_read_outbox_action ON social_read_outbox(account_id, client_action_id); CREATE UNIQUE INDEX IF NOT EXISTS social_read_outbox_message ON social_read_outbox(account_id, conversation_id, message_id); CREATE INDEX IF NOT EXISTS social_read_outbox_account ON social_read_outbox(account_id, created_at, id);");
    return value;
  });
  return database;
}

function fromRow(row: Record<string, string | number | null>): SocialReadMutation {
  return { id: String(row.id), accountId: String(row.account_id), conversationId: Number(row.conversation_id), messageId: Number(row.message_id), clientActionId: String(row.client_action_id), state: row.state as SocialReadMutation['state'], attempts: Number(row.attempts), nextAttemptAt: Number(row.next_attempt_at), error: row.error === null ? null : String(row.error), createdAt: Number(row.created_at) };
}

export const sqliteSocialReadCursorOutbox: SocialReadOutboxStore = {
  async recover() { await (await db()).runAsync("UPDATE social_read_outbox SET state = 'pending' WHERE state = 'sending'"); },
  async getRunnable(accountId, now) { const row = await (await db()).getFirstAsync<Record<string, string | number | null>>("SELECT * FROM social_read_outbox WHERE account_id = ? AND (state = 'pending' OR (state = 'retry_wait' AND next_attempt_at <= ?)) ORDER BY created_at, id LIMIT 1", accountId, now); return row ? fromRow(row) : null; },
  async getByAccount(accountId) { return (await (await db()).getAllAsync<Record<string, string | number | null>>('SELECT * FROM social_read_outbox WHERE account_id = ? ORDER BY created_at, id', accountId)).map(fromRow); },
  async getByMessage(accountId, conversationId, messageId) { const row = await (await db()).getFirstAsync<Record<string, string | number | null>>('SELECT * FROM social_read_outbox WHERE account_id = ? AND conversation_id = ? AND message_id = ?', accountId, conversationId, messageId); return row ? fromRow(row) : null; },
  async put(item) { await (await db()).runAsync('INSERT OR REPLACE INTO social_read_outbox VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.accountId, item.conversationId, item.messageId, item.clientActionId, item.state, item.attempts, item.nextAttemptAt, item.error, item.createdAt); },
  async remove(accountId, id) { await (await db()).runAsync('DELETE FROM social_read_outbox WHERE account_id = ? AND id = ?', accountId, id); },
  async removeAccount(accountId) { await (await db()).runAsync('DELETE FROM social_read_outbox WHERE account_id = ?', accountId); },
};

registerAccountLocalDataRemover((accountId) => sqliteSocialReadCursorOutbox.removeAccount(accountId));
