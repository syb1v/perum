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

test('keeps version conflict for explicit user resolution', async () => {
  const data = store(); const core = createHomeworkOutbox({ store: data, key: () => 'conflict', send: async () => ({ type: 'http', status: 409, message: 'version conflict' }) });
  await core.enqueue('account', 4, 1, 'completed'); await core.run('account');
  assert.equal(data.rows.get('conflict')?.state, 'failed_permanent');
});
