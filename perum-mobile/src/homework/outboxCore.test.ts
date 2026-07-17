import assert from 'node:assert/strict';
import test from 'node:test';
import { createHomeworkOutbox, type HomeworkStore } from './outboxCore';
import type { HomeworkMutation } from './types';

function store(): HomeworkStore & { rows: Map<string, HomeworkMutation> } {
  const rows = new Map<string, HomeworkMutation>();
  return { rows, async recover() { for (const [id, item] of rows) if (item.state === 'sending') rows.set(id, { ...item, state: 'pending' }); }, async getRunnable(accountId, now) { return [...rows.values()].filter(item => item.accountId === accountId && (item.state === 'pending' || item.state === 'retry_wait' && item.nextAttemptAt <= now)).sort((a, b) => a.createdAt - b.createdAt)[0] ?? null; }, async getByAccount(accountId) { return [...rows.values()].filter(item => item.accountId === accountId); }, async put(item) { rows.set(item.id, item); }, async remove(id) { rows.delete(id); }, async removeAccount(accountId) { for (const [id, item] of rows) if (item.accountId === accountId) rows.delete(id); } };
}

test('keeps stable action id across retry and publishes success', async () => {
  const data = store(); let attempts = 0; let successVersion = 0;
  const core = createHomeworkOutbox({ store: data, key: () => 'action-1', now: () => 10, send: async item => { assert.equal(item.clientActionId, 'action-1'); attempts += 1; return attempts === 1 ? { type: 'transport' } : { type: 'success', state: { status: item.status, version: 2, completed_at: null } }; }, onSuccess: (_, __, state) => { successVersion = state.version; } });
  await core.enqueue('account', 4, 1, 'completed'); await core.run('account');
  assert.equal(data.rows.get('action-1')?.state, 'retry_wait');
  data.rows.set('action-1', { ...data.rows.get('action-1')!, nextAttemptAt: 0 });
  await core.run('account'); assert.equal(data.rows.size, 0); assert.equal(successVersion, 2);
});

test('marks a 409 without server state as a permanent error', async () => {
  const data = store(); const core = createHomeworkOutbox({ store: data, key: () => 'conflict', send: async () => ({ type: 'http', status: 409, message: 'version conflict' }) });
  await core.enqueue('account', 4, 1, 'completed'); await core.run('account');
  assert.equal(data.rows.get('conflict')?.state, 'failed_permanent');
});

test('resolves version conflict with server or a new local action', async () => {
  const data = store(); let sent = 0; const ids = ['first', 'second'];
  const core = createHomeworkOutbox({ store: data, key: () => ids.shift()!, send: async item => { sent += 1; return sent === 1 ? { type: 'http', status: 409, serverState: { status: 'in_progress', version: 3, completed_at: null } } : { type: 'success', state: { status: item.status, version: 4, completed_at: null } }; } });
  await core.enqueue('account', 4, 1, 'completed'); await core.run('account');
  assert.equal(data.rows.get('first')?.state, 'conflict');
  await core.resolve('account', 'first', 'local');
  assert.equal(data.rows.size, 0);
  assert.equal(sent, 2);
});

test('keeps first-write conflict with server state for explicit resolution', async () => {
  const data = store(); const core = createHomeworkOutbox({ store: data, key: () => 'first-write', send: async () => ({ type: 'http', status: 409, serverState: { status: 'completed', version: 1, completed_at: '2026-07-16T10:00:00' } }) });
  await core.enqueue('account', 4, 0, 'in_progress'); await core.run('account');
  assert.equal(data.rows.get('first-write')?.state, 'conflict');
  assert.deepEqual(data.rows.get('first-write')?.serverState, { status: 'completed', version: 1, completed_at: '2026-07-16T10:00:00' });
});

test('disabled homework send preserves row and resumes the same action identity', async () => {
  const data = store(); let enabled = false; const sent: string[] = [];
  const core = createHomeworkOutbox({ store: data, canSend: () => enabled, key: () => 'homework-stable', send: async (item) => { sent.push(item.clientActionId); return { type: 'success', state: { status: item.status, version: 2, completed_at: null } }; } });
  await core.enqueue('a', 4, 1, 'completed'); const before = structuredClone(data.rows.get('homework-stable')!); await core.run('a');
  assert.deepEqual(data.rows.get('homework-stable'), before); assert.deepEqual(sent, []); enabled = true; await core.run('a'); assert.deepEqual(sent, ['homework-stable']);
});

test('homework downgrade during transition restores unchanged row', async () => {
  const data = store(); let enabled = true; let sends = 0; const put = data.put;
  data.put = async (row) => { await put(row); if (row.state === 'sending') enabled = false; };
  const core = createHomeworkOutbox({ store: data, canSend: () => enabled, key: () => 'homework-race', send: async (item) => { sends += 1; return { type: 'success', state: { status: item.status, version: 2, completed_at: null } }; } });
  await core.enqueue('a', 4, 1, 'completed'); const before = structuredClone(data.rows.get('homework-race')!); await core.run('a'); assert.equal(sends, 0); assert.deepEqual(data.rows.get('homework-race'), before);
});
