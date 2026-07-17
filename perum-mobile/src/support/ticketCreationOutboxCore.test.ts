import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupportTicketCreationOutboxCore, type SupportTicketCreationStore, type SupportTicketCreateResult } from './ticketCreationOutboxCore';
import type { SupportTicketCreateMutation, SupportTicketCreateOut } from './types';

function memoryStore(seed: SupportTicketCreateMutation[] = []): SupportTicketCreationStore & { rows: SupportTicketCreateMutation[] } {
  const store: SupportTicketCreationStore & { rows: SupportTicketCreateMutation[] } = {
    rows: [...seed],
    async recover() { store.rows = store.rows.map((item) => item.state === 'sending' ? { ...item, state: 'pending' } : item); },
    async getRunnable(accountId, now) { return store.rows.filter((item) => item.accountId === accountId && (item.state === 'pending' || item.state === 'retry_wait' && item.nextAttemptAt <= now)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0] ?? null; },
    async getByAccount(accountId) { return store.rows.filter((item) => item.accountId === accountId); },
    async put(item) { store.rows = [...store.rows.filter((row) => row.id !== item.id), item]; },
    async remove(accountId, id) { store.rows = store.rows.filter((item) => item.accountId !== accountId || item.id !== id); },
    async removeAccount(accountId) { store.rows = store.rows.filter((item) => item.accountId !== accountId); },
  };
  return store;
}

function result(id: string, replayed = false): SupportTicketCreateOut {
  const now = new Date(0).toISOString();
  return { ticket: { id, correlation_id: 'correlation', subject: 'Subject', category: 'general', status: 'open', priority: 'normal', escalation_status: 'none', version: 1, last_message_at: now, unread: false, created_at: now, updated_at: now }, initial_message: { id: 'message', sender_id: 1, side: 'requester', body: 'Body', created_at: now }, replayed };
}

test('persists immutable identities through retry and reconciliation', async () => {
  const store = memoryStore(); let now = 100; let attempt = 0; const payloads: SupportTicketCreateMutation[] = [];
  const core = createSupportTicketCreationOutboxCore({ store, now: () => now, key: () => 'stable', backoff: () => 10, send: async (item) => { payloads.push(structuredClone(item)); return attempt++ === 0 ? { type: 'transport' } : { type: 'success', result: result('server', true) }; } });
  const row = await core.enqueue('tenant:user', 'general', 'Subject', 'Body');
  assert.notEqual(row.clientTicketId, row.clientMessageId);
  await core.run('tenant:user'); now = 110; await core.run('tenant:user');
  assert.deepEqual(payloads.map((item) => [item.clientTicketId, item.clientMessageId, item.subject, item.body]), [[row.clientTicketId, row.clientMessageId, 'Subject', 'Body'], [row.clientTicketId, row.clientMessageId, 'Subject', 'Body']]);
  assert.equal(store.rows[0]?.state, 'reconciled');
  assert.equal(store.rows[0]?.serverTicketId, 'server');
});

test('isolates accounts and logout cleanup removes only selected rows', async () => {
  const store = memoryStore(); let key = 0; const sent: string[] = [];
  const core = createSupportTicketCreationOutboxCore({ store, key: () => `id-${++key}`, send: async (item) => { sent.push(item.accountId); return { type: 'success', result: result(`server-${item.accountId}`) }; } });
  await core.enqueue('a', 'general', 'Subject A', 'Body A'); await core.enqueue('b', 'general', 'Subject B', 'Body B'); await core.run('a');
  assert.deepEqual(sent, ['a']); assert.equal(store.rows.find((item) => item.accountId === 'b')?.state, 'pending'); await core.removeAccount('a'); assert.deepEqual(store.rows.map((item) => item.accountId), ['b']);
});

test('retries required transient statuses and preserves permanent failures', async () => {
  for (const failure of [{ type: 'http', status: 408 }, { type: 'http', status: 425 }, { type: 'http', status: 429 }, { type: 'http', status: 503 }] as SupportTicketCreateResult[]) {
    const store = memoryStore(); let now = 1; let attempt = 0;
    const core = createSupportTicketCreationOutboxCore({ store, now: () => now, key: () => 'stable', backoff: () => 2, send: async () => attempt++ === 0 ? failure : { type: 'success', result: result('server') } });
    await core.enqueue('a', 'general', 'Subject', 'Body'); await core.run('a'); assert.equal(store.rows[0]?.state, 'retry_wait'); now = 3; await core.run('a'); assert.equal(store.rows[0]?.state, 'reconciled');
  }
  for (const status of [400, 403, 409, 422]) {
    const store = memoryStore(); const core = createSupportTicketCreationOutboxCore({ store, key: () => `id-${status}`, send: async () => ({ type: 'http', status }) });
    const row = await core.enqueue('a', 'general', 'Subject', 'Body'); await core.run('a'); assert.equal(store.rows[0]?.state, 'failed_permanent'); await core.retry('a', row.id); assert.equal(store.rows[0]?.clientTicketId, row.clientTicketId);
  }
});

test('crash recovery and capability downgrade preserve the exact mutation', async () => {
  const row: SupportTicketCreateMutation = { id: 'stable', accountId: 'a', clientTicketId: 'ticket-stable', clientMessageId: 'message-stable', category: 'general', subject: 'Subject', body: 'Body', state: 'sending', attempts: 0, nextAttemptAt: 0, error: null, createdAt: 1, serverTicketId: null };
  const store = memoryStore([row]); let enabled = false; let sends = 0;
  const core = createSupportTicketCreationOutboxCore({ store, canSend: () => enabled, send: async () => { sends += 1; return { type: 'success', result: result('server') }; } });
  await core.recover(); const pending = structuredClone(store.rows[0]); await core.run('a'); assert.deepEqual(store.rows[0], pending);
  enabled = true; const put = store.put; store.put = async (item) => { await put(item); if (item.state === 'sending') enabled = false; }; await core.run('a'); assert.equal(sends, 0); assert.deepEqual(store.rows[0], pending);
});
