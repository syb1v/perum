import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminActionOutbox, type AdminActionMutation, type AdminActionStore } from './adminActionOutboxCore';
import type { SupportTicket } from './types';

function memoryStore(): AdminActionStore & { rows: Map<string, AdminActionMutation> } {
  const rows = new Map<string, AdminActionMutation>();
  return { rows, async recover() { for (const [id, item] of rows) if (item.state === 'sending') rows.set(id, { ...item, state: 'pending' }); }, async getRunnable(accountId, now) { return [...rows.values()].find(item => item.accountId === accountId && (item.state === 'pending' || (item.state === 'retry_wait' && item.nextAttemptAt <= now))) ?? null; }, async getByAccount(accountId) { return [...rows.values()].filter(item => item.accountId === accountId); }, async put(item) { rows.set(item.id, item); }, async remove(id) { rows.delete(id); }, async removeAccount(accountId) { for (const [id, item] of rows) if (item.accountId === accountId) rows.delete(id); } };
}

test('admin action outbox preserves id and version through transport retry', async () => {
  const store = memoryStore(); let now = 1000; const sent: AdminActionMutation[] = [];
  const core = createAdminActionOutbox({ store, now: () => now, key: () => 'action-1', send: async item => { sent.push(item); return sent.length === 1 ? { type: 'transport' } : { type: 'success', ticket: { id: item.ticketId } as SupportTicket }; } });
  await core.enqueue('account-1', 'ticket-1', 4, { kind: 'metadata', field: 'priority', value: 'urgent' }); await core.run('account-1');
  assert.equal(store.rows.get('action-1')?.state, 'retry_wait'); now = 3000; await core.run('account-1');
  assert.equal(store.rows.size, 0); assert.deepEqual(sent.map(item => [item.id, item.expectedVersion]), [['action-1', 4], ['action-1', 4]]);
});

test('one pending mutation per ticket prevents stale offline chains', async () => {
  const store = memoryStore(); const core = createAdminActionOutbox({ store, key: () => 'action-1', canSend: () => false, send: async () => ({ type: 'transport' }) });
  assert.ok(await core.enqueue('account-1', 'ticket-1', 2, { kind: 'metadata', field: 'status', value: 'resolved' }));
  assert.equal(await core.enqueue('account-1', 'ticket-1', 2, { kind: 'assignment', assigneeId: 7 }), null); assert.equal(store.rows.size, 1);
});

test('version conflict is terminal and requires explicit discard', async () => {
  const store = memoryStore(); let conflicts = 0; const core = createAdminActionOutbox({ store, key: () => 'action-1', send: async () => ({ type: 'http', status: 409, code: 'VERSION_CONFLICT' }), onConflict: () => { conflicts += 1; } });
  await core.enqueue('account-1', 'ticket-1', 3, { kind: 'assignment', assigneeId: null }); await core.run('account-1');
  assert.equal(store.rows.get('action-1')?.state, 'conflict'); assert.equal(conflicts, 1); await core.run('account-1'); assert.equal(conflicts, 1);
  await core.discard('account-1', 'action-1'); assert.equal(store.rows.size, 0);
});

test('unrelated 409 is a permanent rejection rather than a version conflict', async () => {
  const store = memoryStore(); let conflicts = 0; const core = createAdminActionOutbox({ store, key: () => 'action-1', send: async () => ({ type: 'http', status: 409, code: 'TICKET_CLOSED' }), onConflict: () => { conflicts += 1; } });
  await core.enqueue('account-1', 'ticket-1', 3, { kind: 'metadata', field: 'status', value: 'resolved' }); await core.run('account-1');
  assert.equal(store.rows.get('action-1')?.state, 'failed_permanent'); assert.equal(conflicts, 0);
});

test('crash recovery, capability pause and account isolation preserve mutation identity', async () => {
  const store = memoryStore(); let enabled = false; const sent: string[] = [];
  const first = createAdminActionOutbox({ store, key: () => 'action-1', canSend: () => enabled, send: async item => { sent.push(item.id); return { type: 'success', ticket: { id: item.ticketId } as SupportTicket }; } });
  await first.enqueue('account-1', 'ticket-1', 6, { kind: 'metadata', field: 'category', value: 'technical' });
  await store.put({ ...(store.rows.get('action-1') as AdminActionMutation), state: 'sending' });
  await store.put({ ...(store.rows.get('action-1') as AdminActionMutation), id: 'other-action', accountId: 'account-2', ticketId: 'ticket-2' });
  await first.recover(); await first.run('account-1');
  assert.equal(store.rows.get('action-1')?.state, 'pending'); assert.deepEqual(sent, []);
  enabled = true; await first.run('account-1');
  assert.deepEqual(sent, ['action-1']); assert.equal(store.rows.has('action-1'), false); assert.equal(store.rows.has('other-action'), true);
});
