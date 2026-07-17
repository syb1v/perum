import * as SQLite from 'expo-sqlite';
import { registerAccountLocalDataRemover } from '../query/persistence';
import type { SupportTicketCreationStore } from './ticketCreationOutboxCore';
import type { SupportTicketCreateMutation } from './types';

let database: Promise<SQLite.SQLiteDatabase> | null = null;

async function db() {
  if (!database) database = SQLite.openDatabaseAsync('perum-mobile.db').then(async (value) => {
    await value.execAsync("PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS support_ticket_creation_outbox (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, client_ticket_id TEXT NOT NULL, client_message_id TEXT NOT NULL, category TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL, error TEXT, created_at INTEGER NOT NULL, server_ticket_id TEXT); CREATE UNIQUE INDEX IF NOT EXISTS support_ticket_creation_ticket_id ON support_ticket_creation_outbox(account_id, client_ticket_id); CREATE UNIQUE INDEX IF NOT EXISTS support_ticket_creation_message_id ON support_ticket_creation_outbox(account_id, client_message_id); CREATE INDEX IF NOT EXISTS support_ticket_creation_account ON support_ticket_creation_outbox(account_id, created_at, id);");
    return value;
  });
  return database;
}

function fromRow(row: Record<string, string | number | null>): SupportTicketCreateMutation {
  return { id: String(row.id), accountId: String(row.account_id), clientTicketId: String(row.client_ticket_id), clientMessageId: String(row.client_message_id), category: String(row.category) as SupportTicketCreateMutation['category'], subject: String(row.subject), body: String(row.body), state: row.state as SupportTicketCreateMutation['state'], attempts: Number(row.attempts), nextAttemptAt: Number(row.next_attempt_at), error: row.error === null ? null : String(row.error), createdAt: Number(row.created_at), serverTicketId: row.server_ticket_id === null ? null : String(row.server_ticket_id) };
}

export const sqliteSupportTicketCreationOutbox: SupportTicketCreationStore = {
  async recover() { await (await db()).runAsync("UPDATE support_ticket_creation_outbox SET state = 'pending' WHERE state = 'sending'"); },
  async getRunnable(accountId, now) { const row = await (await db()).getFirstAsync<Record<string, string | number | null>>("SELECT * FROM support_ticket_creation_outbox WHERE account_id = ? AND (state = 'pending' OR (state = 'retry_wait' AND next_attempt_at <= ?)) ORDER BY created_at, id LIMIT 1", accountId, now); return row ? fromRow(row) : null; },
  async getByAccount(accountId) { return (await (await db()).getAllAsync<Record<string, string | number | null>>('SELECT * FROM support_ticket_creation_outbox WHERE account_id = ? ORDER BY created_at DESC, id', accountId)).map(fromRow); },
  async put(item) { await (await db()).runAsync('INSERT OR REPLACE INTO support_ticket_creation_outbox VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', item.id, item.accountId, item.clientTicketId, item.clientMessageId, item.category, item.subject, item.body, item.state, item.attempts, item.nextAttemptAt, item.error, item.createdAt, item.serverTicketId); },
  async remove(accountId, id) { await (await db()).runAsync('DELETE FROM support_ticket_creation_outbox WHERE account_id = ? AND id = ?', accountId, id); },
  async removeAccount(accountId) { await (await db()).runAsync('DELETE FROM support_ticket_creation_outbox WHERE account_id = ?', accountId); },
};

registerAccountLocalDataRemover((accountId) => sqliteSupportTicketCreationOutbox.removeAccount(accountId));
