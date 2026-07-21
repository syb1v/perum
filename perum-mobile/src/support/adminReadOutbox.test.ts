import assert from 'node:assert/strict';
import test from 'node:test';
import { adminTicketReadPath } from './adminCore';
import { createSupportReadCursorOutboxCore, type SupportReadOutboxStore } from './readCursorOutboxCore';
import type { SupportReadMutation } from './types';

function store(): SupportReadOutboxStore & { rows: SupportReadMutation[] } {
  const value: SupportReadOutboxStore & { rows: SupportReadMutation[] } = { rows: [], async recover() { value.rows = value.rows.map(item => item.state === 'sending' ? { ...item, state: 'pending' } : item); }, async getRunnable(accountId, now) { return value.rows.filter(item => item.accountId === accountId && (item.state === 'pending' || item.state === 'retry_wait' && item.nextAttemptAt <= now)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0] ?? null; }, async getByAccount(accountId) { return value.rows.filter(item => item.accountId === accountId); }, async getByMessage(accountId, ticketId, messageId) { return value.rows.find(item => item.accountId === accountId && item.ticketId === ticketId && item.messageId === messageId) ?? null; }, async put(item) { value.rows = [...value.rows.filter(row => row.id !== item.id), item]; }, async remove(accountId, id) { value.rows = value.rows.filter(item => item.accountId !== accountId || item.id !== id); }, async removeAccount(accountId) { value.rows = value.rows.filter(item => item.accountId !== accountId); } };
  return value;
}

test('admin read pause and retry preserve endpoint and action identity', async () => {
  const data = store(); let enabled = false; let now = 1; let attempts = 0; const sent: Array<[string, string, string]> = [];
  const core = createSupportReadCursorOutboxCore({ store: data, canSend: () => enabled, now: () => now, key: () => 'admin-read-1', backoff: () => 10, send: async item => { sent.push([adminTicketReadPath(item.ticketId), item.clientActionId, item.messageId]); return attempts++ === 0 ? { type: 'transport' } : { type: 'success' }; } });
  const first = await core.enqueue('account-1', 'ticket-1', 'message-1'); const duplicate = await core.enqueue('account-1', 'ticket-1', 'message-1'); await core.run('account-1');
  assert.equal(first.clientActionId, duplicate.clientActionId); assert.deepEqual(sent, []);
  enabled = true; await core.run('account-1'); assert.equal(data.rows[0]?.state, 'retry_wait'); now = 11; await core.run('account-1');
  assert.deepEqual(sent, [['/admin/support/tickets/ticket-1/read', 'admin-read-1', 'message-1'], ['/admin/support/tickets/ticket-1/read', 'admin-read-1', 'message-1']]); assert.equal(data.rows.length, 0);
});

test('admin read permanent failure does not block another ticket or leak accounts', async () => {
  const data = store(); let key = 0; const sent: string[] = [];
  const core = createSupportReadCursorOutboxCore({ store: data, key: () => `read-${++key}`, send: async item => { sent.push(`${item.accountId}:${item.ticketId}`); return item.ticketId === 'missing' ? { type: 'http', status: 404 } : { type: 'success' }; } });
  await core.enqueue('account-1', 'missing', 'message-1'); await core.enqueue('account-1', 'valid', 'message-2'); await core.enqueue('account-2', 'foreign', 'message-3'); await core.run('account-1');
  assert.deepEqual(sent, ['account-1:missing', 'account-1:valid']); assert.equal(data.rows.find(item => item.ticketId === 'missing')?.state, 'failed_permanent'); assert.equal(data.rows.find(item => item.accountId === 'account-2')?.state, 'pending');
  await core.removeAccount('account-1'); assert.deepEqual(data.rows.map(item => item.accountId), ['account-2']);
});

test('explicit admin read retry reuses the immutable action identity', async () => {
  const data = store(); let fail = true; const identities: string[] = [];
  const core = createSupportReadCursorOutboxCore({ store: data, key: () => 'read-stable', send: async item => { identities.push(item.clientActionId); return fail ? { type: 'http', status: 404 } : { type: 'success' }; } });
  const row = await core.enqueue('account-1', 'ticket-1', 'message-1'); await core.run('account-1'); assert.equal(data.rows[0]?.state, 'failed_permanent');
  fail = false; await core.retry('account-1', row.id); assert.deepEqual(identities, ['read-stable', 'read-stable']); assert.equal(data.rows.length, 0);
});
