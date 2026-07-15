import assert from 'node:assert/strict';
import test from 'node:test';
import { createOutboxCore, type OutboxStore, type PatchResult } from './outboxCore';
import type { PreferencesMutation, PreferencesSnapshot } from './types';

const snapshot = (enabled: boolean, version = 1): PreferencesSnapshot => ({ data: { push_preview_enabled: enabled, version, created_at: '', updated_at: '' }, etag: `"${version}"` });

function memoryStore(): OutboxStore & { rows: PreferencesMutation[] } {
  const store = {
    rows: [] as PreferencesMutation[],
    async recover() { store.rows = store.rows.map((row) => row.state === 'sending' ? { ...row, state: 'pending' } : row); },
    async getRunnable(accountId: string, now: number) { return store.rows.find((row) => row.accountId === accountId && (row.state === 'pending' || row.state === 'retry_wait' && row.nextAttemptAt <= now)) ?? null; },
    async getUnsent(accountId: string) { return store.rows.find((row) => row.accountId === accountId && (row.state === 'pending' || row.state === 'retry_wait')) ?? null; },
    async getLatest(accountId: string) { return [...store.rows].reverse().find((row) => row.accountId === accountId) ?? null; },
    async put(row: PreferencesMutation) { const index = store.rows.findIndex((item) => item.id === row.id); if (index < 0) store.rows.push(row); else store.rows[index] = row; },
    async remove(id: string) { store.rows = store.rows.filter((row) => row.id !== id); },
    async removeAccount(accountId: string) { store.rows = store.rows.filter((row) => row.accountId !== accountId); },
  };
  return store;
}

function setup(patch: (mutation: PreferencesMutation) => Promise<PatchResult>, store = memoryStore()) {
  let id = 0;
  const successes: PreferencesSnapshot[] = [];
  const core = createOutboxCore({ store, patch, key: () => `key-${++id}`, now: () => 100, backoff: () => 10, onSuccess: (_, value) => { successes.push(value); } });
  return { core, store, successes };
}

test('isolates accounts and cleans only the selected account', async () => {
  const { core, store } = setup(async () => ({ type: 'success', snapshot: snapshot(true) }));
  await core.enqueue('a', true, '"1"'); await core.enqueue('b', false, '"2"');
  await core.removeAccount('a');
  assert.deepEqual(store.rows.map((row) => row.accountId), ['b']);
});

test('retains idempotency key and etag across retry', async () => {
  const seen: PreferencesMutation[] = [];
  const { core, store } = setup(async (row) => { seen.push(row); return seen.length === 1 ? { type: 'transport' } : { type: 'success', snapshot: snapshot(true, 2) }; });
  const original = await core.enqueue('a', true, '"1"'); await core.run('a');
  store.rows[0].nextAttemptAt = 0; await core.run('a');
  assert.equal(seen[1].idempotencyKey, original.idempotencyKey); assert.equal(seen[1].baseEtag, '"1"');
});

test('coalesces unsent preferences safely', async () => {
  const { core, store } = setup(async () => ({ type: 'success', snapshot: snapshot(true) }));
  const first = await core.enqueue('a', true, '"1"'); const second = await core.enqueue('a', false, '"1"');
  assert.equal(store.rows.length, 1); assert.equal(second.idempotencyKey, first.idempotencyKey); assert.equal(second.desired, false);
});

test('replays successfully and publishes server snapshot', async () => {
  const result = snapshot(true, 2); const { core, store, successes } = setup(async () => ({ type: 'success', snapshot: result }));
  await core.enqueue('a', true, '"1"'); await core.run('a');
  assert.equal(store.rows.length, 0); assert.deepEqual(successes, [result]);
});

test('resolves conflict with server or new local CAS identity', async () => {
  const { core, store, successes } = setup(async () => ({ type: 'http', status: 412, current: snapshot(false, 3) }));
  const original = await core.enqueue('a', true, '"1"'); await core.run('a'); await core.resolveConflict('a', 'local');
  assert.notEqual(store.rows[0].idempotencyKey, original.idempotencyKey); assert.equal(store.rows[0].baseEtag, '"3"');
  store.rows[0].state = 'conflict'; store.rows[0].conflictCurrent = snapshot(false, 3); await core.resolveConflict('a', 'server');
  assert.equal(store.rows.length, 0); assert.deepEqual(successes, [snapshot(false, 3)]);
});

test('recovers sending rows after a crash', async () => {
  const { core, store } = setup(async () => ({ type: 'success', snapshot: snapshot(true) }));
  const row = await core.enqueue('a', true, '"1"'); await store.put({ ...row, state: 'sending' }); await core.recover();
  assert.equal(store.rows[0].state, 'pending');
});

test('retries in-progress but permanently fails reused keys', async () => {
  const { core, store } = setup(async () => ({ type: 'http', status: 409, code: 'IDEMPOTENCY_IN_PROGRESS' }));
  await core.enqueue('a', true, '"1"'); await core.run('a');
  assert.equal(store.rows[0].state, 'retry_wait');
  store.rows[0].state = 'pending';
  const permanent = createOutboxCore({ store, patch: async () => ({ type: 'http', status: 409, code: 'IDEMPOTENCY_KEY_REUSED' }) });
  await permanent.run('a');
  assert.equal(store.rows[0].state, 'failed_permanent');
});
