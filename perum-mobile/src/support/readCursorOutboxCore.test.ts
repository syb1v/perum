import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupportReadCursorOutboxCore, type SupportReadOutboxStore, type SupportReadResult } from './readCursorOutboxCore';
import type { SupportReadMutation } from './types';

function memoryStore(seed: SupportReadMutation[] = []): SupportReadOutboxStore & { rows: SupportReadMutation[] } {
  const store: SupportReadOutboxStore & { rows: SupportReadMutation[] } = {
    rows: [...seed],
    async recover() { store.rows = store.rows.map((item) => item.state === 'sending' ? { ...item, state: 'pending' } : item); },
    async getRunnable(accountId, now) { return store.rows.filter((item) => item.accountId === accountId && (item.state === 'pending' || item.state === 'retry_wait' && item.nextAttemptAt <= now)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0] ?? null; },
    async getByAccount(accountId) { return store.rows.filter((item) => item.accountId === accountId); },
    async getByMessage(accountId, ticketId, messageId) { return store.rows.find((item) => item.accountId === accountId && item.ticketId === ticketId && item.messageId === messageId) ?? null; },
    async put(item) { store.rows = [...store.rows.filter((row) => row.id !== item.id), item]; },
    async remove(accountId, id) { store.rows = store.rows.filter((item) => item.accountId !== accountId || item.id !== id); },
    async removeAccount(accountId) { store.rows = store.rows.filter((item) => item.accountId !== accountId); },
  };
  return store;
}

test('isolates accounts, deduplicates message cursors and cleans up one account', async () => {
  const store = memoryStore(); let key = 0; const sent: string[] = [];
  const core = createSupportReadCursorOutboxCore({ store, key: () => `read-${++key}`, send: async (item) => { sent.push(item.accountId); return { type: 'success' }; } });
  const first = await core.enqueue('tenant:user-a', 'ticket', 'message');
  const duplicate = await core.enqueue('tenant:user-a', 'ticket', 'message');
  await core.enqueue('tenant:user-b', 'ticket', 'message');
  assert.equal(first.clientActionId, duplicate.clientActionId);
  assert.equal(store.rows.length, 2);
  await core.run('tenant:user-a');
  assert.deepEqual(sent, ['tenant:user-a']);
  await core.removeAccount('tenant:user-b');
  assert.equal(store.rows.length, 0);
});

test('retries transient failures with stable action identity and recovers a crash', async () => {
  for (const failure of [{ type: 'transport' }, { type: 'http', status: 401 }, { type: 'http', status: 408 }, { type: 'http', status: 425 }, { type: 'http', status: 429 }, { type: 'http', status: 503 }] as SupportReadResult[]) {
    let now = 100; let attempt = 0; const ids: string[] = [];
    const row: SupportReadMutation = { id: 'stable', accountId: 'a', ticketId: 'ticket', messageId: 'message', clientActionId: 'stable', state: 'sending', attempts: 0, nextAttemptAt: 0, error: null, createdAt: 1 };
    const store = memoryStore([row]);
    const core = createSupportReadCursorOutboxCore({ store, now: () => now, backoff: () => 10, send: async (item) => { ids.push(item.clientActionId); return attempt++ === 0 ? failure : { type: 'success' }; } });
    await core.recover();
    assert.equal(store.rows[0]?.state, 'pending');
    await core.run('a');
    assert.equal(store.rows[0]?.state, 'retry_wait');
    now = 110;
    await core.run('a');
    assert.deepEqual(ids, ['stable', 'stable']);
    assert.equal(store.rows.length, 0);
  }
});

test('marks permanent failures without blocking an independent cursor', async () => {
  const store = memoryStore(); let key = 0; const sent: string[] = [];
  const core = createSupportReadCursorOutboxCore({ store, key: () => `read-${++key}`, send: async (item) => { sent.push(item.ticketId); return item.ticketId === 'missing' ? { type: 'http', status: 404 } : { type: 'success' }; } });
  await core.enqueue('a', 'missing', 'one');
  await core.enqueue('a', 'valid', 'two');
  await core.run('a');
  assert.deepEqual(sent, ['missing', 'valid']);
  assert.equal(store.rows[0]?.state, 'failed_permanent');
});

test('capability disable and transition downgrade preserve immutable cursor', async () => {
  const store = memoryStore(); let enabled = false; let sends = 0;
  const core = createSupportReadCursorOutboxCore({ store, canSend: () => enabled, key: () => 'read-stable', send: async () => { sends += 1; return { type: 'success' }; } });
  await core.enqueue('a', 'ticket', 'message');
  const before = structuredClone(store.rows[0]);
  await core.run('a');
  assert.deepEqual(store.rows[0], before);
  enabled = true;
  const put = store.put;
  store.put = async (row) => { await put(row); if (row.state === 'sending') enabled = false; };
  await core.run('a');
  assert.equal(sends, 0);
  assert.deepEqual(store.rows[0], before);
});
