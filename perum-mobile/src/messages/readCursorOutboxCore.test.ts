import assert from 'node:assert/strict';
import test from 'node:test';
import { createSocialReadCursorOutboxCore, type SocialReadOutboxStore, type SocialReadResult } from './readCursorOutboxCore';
import type { SocialReadMutation } from './types';

function memoryStore(seed: SocialReadMutation[] = []): SocialReadOutboxStore & { rows: SocialReadMutation[] } {
  const store: SocialReadOutboxStore & { rows: SocialReadMutation[] } = {
    rows: [...seed],
    async recover() { store.rows = store.rows.map((item) => item.state === 'sending' ? { ...item, state: 'pending' } : item); },
    async getRunnable(accountId, now) { return store.rows.filter((item) => item.accountId === accountId && (item.state === 'pending' || item.state === 'retry_wait' && item.nextAttemptAt <= now)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0] ?? null; },
    async getByAccount(accountId) { return store.rows.filter((item) => item.accountId === accountId); },
    async getByMessage(accountId, conversationId, messageId) { return store.rows.find((item) => item.accountId === accountId && item.conversationId === conversationId && item.messageId === messageId) ?? null; },
    async put(item) { store.rows = [...store.rows.filter((row) => row.id !== item.id), item]; },
    async remove(accountId, id) { store.rows = store.rows.filter((item) => item.accountId !== accountId || item.id !== id); },
    async removeAccount(accountId) { store.rows = store.rows.filter((item) => item.accountId !== accountId); },
  };
  return store;
}

test('isolates accounts, deduplicates cursors and cleans one account', async () => {
  const store = memoryStore(); let key = 0; const sent: string[] = [];
  const core = createSocialReadCursorOutboxCore({ store, key: () => `read-${++key}`, send: async (item) => { sent.push(item.accountId); return { type: 'success' }; } });
  const first = await core.enqueue('tenant:user-a', 1, 10);
  const duplicate = await core.enqueue('tenant:user-a', 1, 10);
  await core.enqueue('tenant:user-b', 1, 10);
  assert.equal(first.clientActionId, duplicate.clientActionId);
  await core.run('tenant:user-a');
  assert.deepEqual(sent, ['tenant:user-a']);
  await core.removeAccount('tenant:user-b');
  assert.equal(store.rows.length, 0);
});

test('recovers and retries transient failures with stable identity', async () => {
  for (const failure of [{ type: 'transport' }, { type: 'http', status: 401 }, { type: 'http', status: 429 }, { type: 'http', status: 503 }] as SocialReadResult[]) {
    let now = 100; let attempt = 0; const ids: string[] = [];
    const row: SocialReadMutation = { id: 'stable', accountId: 'a', conversationId: 1, messageId: 2, clientActionId: 'stable', state: 'sending', attempts: 0, nextAttemptAt: 0, error: null, createdAt: 1 };
    const store = memoryStore([row]);
    const core = createSocialReadCursorOutboxCore({ store, now: () => now, backoff: () => 10, send: async (item) => { ids.push(item.clientActionId); return attempt++ === 0 ? failure : { type: 'success' }; } });
    await core.recover(); await core.run('a'); now = 110; await core.run('a');
    assert.deepEqual(ids, ['stable', 'stable']);
    assert.equal(store.rows.length, 0);
  }
});

test('capability and lifecycle guards prevent in-flight resurrection', async () => {
  const store = memoryStore(); let enabled = false; let sends = 0;
  const core = createSocialReadCursorOutboxCore({ store, canSend: () => enabled, key: () => 'stable', send: async () => { sends += 1; return { type: 'success' }; } });
  await core.enqueue('a', 1, 2);
  const before = structuredClone(store.rows[0]);
  await core.run('a');
  enabled = true;
  const put = store.put;
  store.put = async (row) => { await put(row); if (row.state === 'sending') enabled = false; };
  await core.run('a');
  assert.equal(sends, 0);
  assert.deepEqual(store.rows[0], before);
});
