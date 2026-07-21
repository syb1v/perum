import assert from 'node:assert/strict';
import test from 'node:test';
import { adminTicketReplyPath } from './adminCore';
import { createSupportOutboxCore, type SupportOutboxStore, type SupportSendResult } from './outboxCore';
import type { SupportMessage, SupportMutation } from './types';

function store(): SupportOutboxStore & { rows: SupportMutation[] } {
  const value: SupportOutboxStore & { rows: SupportMutation[] } = { rows: [], async recover() { value.rows = value.rows.map(item => item.state === 'sending' ? { ...item, state: 'pending' } : item); }, async getRunnable(accountId, now) { return value.rows.find(item => item.accountId === accountId && (item.state === 'pending' || item.state === 'retry_wait' && item.nextAttemptAt <= now) && !value.rows.some(previous => previous.accountId === item.accountId && previous.ticketId === item.ticketId && (previous.createdAt < item.createdAt || previous.createdAt === item.createdAt && previous.id < item.id))) ?? null; }, async getByAccount(accountId) { return value.rows.filter(item => item.accountId === accountId); }, async put(item) { value.rows = [...value.rows.filter(row => row.id !== item.id), item]; }, async remove(id) { value.rows = value.rows.filter(item => item.id !== id); }, async removeAccount(accountId) { value.rows = value.rows.filter(item => item.accountId !== accountId); } };
  return value;
}
const success = (item: SupportMutation): SupportMessage => ({ id: `server-${item.id}`, sender_id: 1, side: 'shared_inbox', body: item.body, created_at: new Date(item.createdAt).toISOString() });

test('admin reply pause and retry preserve endpoint identity and body', async () => {
  const data = store(); let enabled = false; let now = 1; let attempts = 0; const sent: Array<[string, string, string]> = [];
  const core = createSupportOutboxCore({ store: data, canSend: () => enabled, now: () => now, key: () => 'admin-reply-1', backoff: () => 10, send: async item => { sent.push([adminTicketReplyPath(item.ticketId), item.clientMessageId, item.body]); return attempts++ === 0 ? { type: 'transport' } : { type: 'success', message: success(item) }; } });
  await core.enqueue('account-1', 'ticket-1', 'Ответ'); await core.run('account-1');
  assert.equal(data.rows[0]?.state, 'pending'); assert.deepEqual(sent, []);
  enabled = true; await core.run('account-1'); assert.equal(data.rows[0]?.state, 'retry_wait'); now = 11; await core.run('account-1');
  assert.deepEqual(sent, [['/admin/support/tickets/ticket-1/messages', 'admin-reply-1', 'Ответ'], ['/admin/support/tickets/ticket-1/messages', 'admin-reply-1', 'Ответ']]); assert.equal(data.rows.length, 0);
});

test('admin reply FIFO and account cleanup prevent cross-ticket reordering and leakage', async () => {
  const data = store(); let key = 0; const sent: string[] = [];
  const core = createSupportOutboxCore({ store: data, key: () => `reply-${++key}`, send: async (item): Promise<SupportSendResult> => { sent.push(`${item.accountId}:${item.body}`); return item.body === 'blocked' ? { type: 'http', status: 409 } : { type: 'success', message: success(item) }; } });
  await core.enqueue('account-1', 'ticket-1', 'blocked'); await core.enqueue('account-1', 'ticket-1', 'after'); await core.enqueue('account-2', 'ticket-1', 'foreign'); await core.run('account-1');
  assert.deepEqual(sent, ['account-1:blocked']); assert.equal(data.rows.find(item => item.body === 'after')?.state, 'pending'); assert.equal(data.rows.find(item => item.body === 'foreign')?.state, 'pending');
  await core.removeAccount('account-1'); assert.deepEqual(data.rows.map(item => item.accountId), ['account-2']);
});
