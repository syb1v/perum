import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupportOutboxCore, type SupportOutboxStore, type SupportSendResult } from './outboxCore';
import type { SupportMessage, SupportMutation } from './types';

function memoryStore(seed: SupportMutation[] = []): SupportOutboxStore & { rows: SupportMutation[] } {
  const store: SupportOutboxStore & { rows: SupportMutation[] } = {
    rows: [...seed],
    async recover() { store.rows = store.rows.map((item) => item.state === 'sending' ? { ...item, state: 'pending' } : item); },
    async getRunnable(accountId, now) { return store.rows.filter((item) => item.accountId === accountId && (item.state === 'pending' || item.state === 'retry_wait' && item.nextAttemptAt <= now) && !store.rows.some((previous) => previous.accountId === item.accountId && previous.ticketId === item.ticketId && (previous.createdAt < item.createdAt || previous.createdAt === item.createdAt && previous.id < item.id))).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0] ?? null; },
    async getByAccount(accountId) { return store.rows.filter((item) => item.accountId === accountId).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)); },
    async put(item) { store.rows = [...store.rows.filter((row) => row.id !== item.id), item]; },
    async remove(id) { store.rows = store.rows.filter((item) => item.id !== id); },
    async removeAccount(accountId) { store.rows = store.rows.filter((item) => item.accountId !== accountId); },
  };
  return store;
}

const response = (item: SupportMutation): SupportMessage => ({ id: `server-${item.id}`, sender_id: 1, side: 'requester', body: item.body, created_at: new Date(item.createdAt).toISOString() });

test('isolates accounts and logout cleanup removes only that account', async () => {
  const store = memoryStore(); let key = 0; const sent: string[] = [];
  const core = createSupportOutboxCore({ store, key: () => `id-${++key}`, send: async (item) => { sent.push(item.accountId); return { type: 'success', message: response(item) }; } });
  await core.enqueue('a', 'ticket', 'a'); await core.enqueue('b', 'ticket', 'b'); await core.run('a');
  assert.deepEqual(sent, ['a']); assert.equal(store.rows[0]?.accountId, 'b'); await core.removeAccount('b'); assert.equal(store.rows.length, 0);
});

test('preserves ordering within each ticket without blocking another ticket', async () => {
  const store = memoryStore(); let key = 0; const sent: string[] = [];
  const core = createSupportOutboxCore({ store, now: () => 10, key: () => `id-${++key}`, send: async (item): Promise<SupportSendResult> => { sent.push(`${item.ticketId}:${item.body}`); return item.body === 'blocked' ? { type: 'http', status: 422 } : { type: 'success', message: response(item) }; } });
  await core.enqueue('a', 'one', 'blocked'); await core.enqueue('a', 'one', 'after'); await core.enqueue('a', 'two', 'independent'); await core.run('a');
  assert.deepEqual(sent, ['one:blocked', 'two:independent']); assert.equal(store.rows.find((item) => item.body === 'after')?.state, 'pending');
});

test('retries transport and required HTTP statuses with stable client id', async () => {
  for (const failure of [{ type: 'transport' }, { type: 'http', status: 408 }, { type: 'http', status: 425 }, { type: 'http', status: 429 }, { type: 'http', status: 503 }] as SupportSendResult[]) {
    const store = memoryStore(); let now = 100; let attempt = 0; const ids: string[] = [];
    const core = createSupportOutboxCore({ store, now: () => now, key: () => 'stable', backoff: () => 10, send: async (item) => { ids.push(item.clientMessageId); return attempt++ === 0 ? failure : { type: 'success', message: response(item) }; } });
    await core.enqueue('a', 'ticket', 'body'); await core.run('a'); assert.equal(store.rows[0]?.state, 'retry_wait'); now = 110; await core.run('a'); assert.deepEqual(ids, ['stable', 'stable']); assert.equal(store.rows.length, 0);
  }
});

test('marks required permanent statuses and recovers interrupted sends after crash', async () => {
  for (const status of [400, 403, 404, 409, 422]) {
    const row: SupportMutation = { id: `id-${status}`, accountId: 'a', ticketId: 'ticket', clientMessageId: `id-${status}`, body: 'body', state: 'sending', attempts: 0, nextAttemptAt: 0, error: null, createdAt: 1 };
    const store = memoryStore([row]); const core = createSupportOutboxCore({ store, send: async () => ({ type: 'http', status }) });
    await core.recover(); assert.equal(store.rows[0]?.state, 'pending'); await core.run('a'); assert.equal(store.rows[0]?.state, 'failed_permanent');
  }
});

test('disabled support send preserves row and resumes with the same identity', async () => {
  const store = memoryStore(); let enabled = false; const sent: string[] = [];
  const core = createSupportOutboxCore({ store, canSend: () => enabled, key: () => 'support-stable', send: async (item) => { sent.push(item.clientMessageId); return { type: 'success', message: response(item) }; } });
  await core.enqueue('a', 'ticket', 'body'); const before = structuredClone(store.rows[0]); await core.run('a');
  assert.deepEqual(store.rows[0], before); assert.deepEqual(sent, []); enabled = true; await core.run('a'); assert.deepEqual(sent, ['support-stable']);
});

test('support downgrade during transition restores unchanged row', async () => {
  const store = memoryStore(); let enabled = true; let sends = 0; const put = store.put;
  store.put = async (row) => { await put(row); if (row.state === 'sending') enabled = false; };
  const core = createSupportOutboxCore({ store, canSend: () => enabled, key: () => 'support-race', send: async (item) => { sends += 1; return { type: 'success', message: response(item) }; } });
  await core.enqueue('a', 'ticket', 'body'); const before = structuredClone(store.rows[0]); await core.run('a'); assert.equal(sends, 0); assert.deepEqual(store.rows[0], before);
});
