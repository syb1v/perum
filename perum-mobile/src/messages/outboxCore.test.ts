import assert from 'node:assert/strict';
import test from 'node:test';
import { createMessageOutboxCore, type MessageOutboxStore, type SendResult } from './outboxCore';
import type { Message, MessageMutation } from './types';

function memoryStore(seed: MessageMutation[] = []): MessageOutboxStore & { rows: MessageMutation[] } {
  const store: MessageOutboxStore & { rows: MessageMutation[] } = {
    rows: [...seed] as MessageMutation[],
    async recover() { store.rows = store.rows.map((item) => item.state === 'sending' ? { ...item, state: 'pending' } : item); },
    async getRunnable(accountId: string, now: number) { return store.rows.filter((item) => item.accountId === accountId && (item.state === 'pending' || item.state === 'retry_wait' && item.nextAttemptAt <= now)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0] ?? null; },
    async getByAccount(accountId: string) { return store.rows.filter((item) => item.accountId === accountId).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)); },
    async put(item: MessageMutation) { store.rows = [...store.rows.filter((row) => row.id !== item.id), item]; },
    async remove(id: string) { store.rows = store.rows.filter((item) => item.id !== id); },
    async removeAccount(accountId: string) { store.rows = store.rows.filter((item) => item.accountId !== accountId); },
  };
  return store;
}

const message = (item: MessageMutation): Message => ({ id: item.createdAt, sender_id: 1, client_message_id: item.clientMessageId, body: item.body, created_at: new Date(item.createdAt).toISOString(), expires_at: new Date(item.createdAt + 1).toISOString() });

test('keeps every message and sends in stable creation order', async () => {
  const store = memoryStore();
  const sent: string[] = [];
  let key = 0;
  const core = createMessageOutboxCore({ store, now: () => 10, key: () => `id-${++key}`, send: async (item) => { sent.push(item.clientMessageId); return { type: 'success', message: message(item) }; } });
  await core.enqueue('a', 1, 'one'); await core.enqueue('a', 1, 'two');
  assert.equal(store.rows.length, 2);
  await core.run('a');
  assert.deepEqual(sent, ['id-1', 'id-2']);
});

test('isolates active accounts and cleanup removes only selected account', async () => {
  const store = memoryStore(); let key = 0;
  const sent: string[] = [];
  const core = createMessageOutboxCore({ store, key: () => `i${++key}`, send: async (item) => { sent.push(item.accountId); return { type: 'success', message: message(item) }; } });
  await core.enqueue('a', 1, 'a'); await core.enqueue('b', 1, 'b'); await core.run('a');
  assert.deepEqual(sent, ['a']); assert.equal(store.rows[0]?.accountId, 'b');
  await core.removeAccount('b'); assert.equal(store.rows.length, 0);
});

test('retries retryable failures with the same client id and reconciles success', async () => {
  const store = memoryStore(); let now = 100; const ids: string[] = []; let attempt = 0; const reconciled: string[] = [];
  const core = createMessageOutboxCore({ store, now: () => now, key: () => 'stable', backoff: () => 10, onSuccess: (_, value) => { reconciled.push(value.client_message_id); }, send: async (item): Promise<SendResult> => { ids.push(item.clientMessageId); return ++attempt === 1 ? { type: 'http', status: 503 } : { type: 'success', message: message(item) }; } });
  await core.enqueue('a', 1, 'hello'); await core.run('a');
  assert.equal(store.rows[0]?.state, 'retry_wait'); now = 110; await core.run('a');
  assert.deepEqual(ids, ['stable', 'stable']); assert.deepEqual(reconciled, ['stable']); assert.equal(store.rows.length, 0);
});

test('recovery restores interrupted sends and permanent mismatch can be retried explicitly', async () => {
  const row: MessageMutation = { id: 'x', accountId: 'a', conversationId: 1, clientMessageId: 'x', body: 'body', state: 'sending', attempts: 0, nextAttemptAt: 0, error: null, createdAt: 1 };
  const store = memoryStore([row]); let result: SendResult = { type: 'http', status: 409 };
  const core = createMessageOutboxCore({ store, send: async (item) => result.type === 'http' ? result : { type: 'success', message: message(item) } });
  await core.recover(); assert.equal(store.rows[0]?.state, 'pending'); await core.run('a'); assert.equal(store.rows[0]?.state, 'failed_permanent');
  result = { type: 'success', message: message(row) }; await core.retry('a', 'x'); assert.equal(store.rows.length, 0);
});

test('capability downgrade retains the unchanged row and identity until resume', async () => {
  const store = memoryStore(); const sent: string[] = []; let enabled = false;
  const core = createMessageOutboxCore({ store, canSend: () => enabled, key: () => 'stable-capability-id', send: async (item) => { sent.push(item.clientMessageId); return { type: 'success', message: message(item) }; } });
  await core.enqueue('a', 1, 'held');
  const before = { ...store.rows[0] };
  await core.run('a');
  assert.deepEqual(sent, []);
  assert.deepEqual(store.rows[0], before);
  enabled = true;
  await core.run('a');
  assert.deepEqual(sent, ['stable-capability-id']);
  assert.equal(store.rows.length, 0);
});

test('message downgrade during transition restores row without touching another account', async () => {
  const store = memoryStore(); let enabled = true; let sends = 0; const put = store.put;
  store.put = async (row) => { await put(row); if (row.state === 'sending') enabled = false; };
  const core = createMessageOutboxCore({ store, canSend: () => enabled, key: (() => { let id = 0; return () => `race-${++id}`; })(), send: async (item) => { sends += 1; return { type: 'success', message: message(item) }; } });
  await core.enqueue('a', 1, 'a'); await core.enqueue('b', 1, 'b'); const before = structuredClone(store.rows);
  await core.run('a'); assert.equal(sends, 0); assert.deepEqual(store.rows.sort((a, b) => a.id.localeCompare(b.id)), before.sort((a, b) => a.id.localeCompare(b.id)));
});
