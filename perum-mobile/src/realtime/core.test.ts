import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRealtimeEvent, realtimeInvalidationKeys, realtimeUrl, reconnectDelay, shouldConnectRealtime } from './core';

const at = '2026-07-14T12:00:00Z';

test('parses only valid v1 realtime events', () => {
  assert.deepEqual(parseRealtimeEvent(JSON.stringify({ v: 1, type: 'connected', occurred_at: at, data: {} })), { v: 1, type: 'connected', occurred_at: at, data: {} });
  assert.equal(parseRealtimeEvent(JSON.stringify({ v: 2, type: 'connected', occurred_at: at, data: {} })), null);
  assert.equal(parseRealtimeEvent(JSON.stringify({ v: 1, type: 'message.created', occurred_at: at, data: { conversation_id: 1, message_id: 0, sender_id: 2 } })), null);
  assert.equal(parseRealtimeEvent(JSON.stringify({ v: 1, type: 'unknown', occurred_at: at, data: { conversation_id: 1 } })), null);
  assert.equal(parseRealtimeEvent('{'), null);
});

test('parses supported conversation event payloads', () => {
  for (const value of [
    { v: 1, type: 'message.created', occurred_at: at, data: { conversation_id: 4, message_id: 8, sender_id: 2 } },
    { v: 1, type: 'conversation.read', occurred_at: at, data: { conversation_id: 4, message_id: 8, user_id: 2 } },
    { v: 1, type: 'conversation.changed', occurred_at: at, data: { conversation_id: 4, reason: 'locked' } },
  ]) assert.deepEqual(parseRealtimeEvent(JSON.stringify(value)), value);
});

test('uses bounded exponential jitter and secure ticket URL', () => {
  assert.equal(reconnectDelay(0, () => 0), 250);
  assert.equal(reconnectDelay(3, () => 0.5), 4000);
  assert.equal(reconnectDelay(99, () => 1), 22500);
  assert.equal(realtimeUrl('https://school.test/api', '/ws/social', 'a b'), 'wss://school.test/ws/social?ticket=a+b');
});

test('connect lifecycle requires active online student account', () => {
  const active = { accountId: 'a', role: 'student', foreground: true, online: true };
  assert.equal(shouldConnectRealtime(active), true);
  assert.equal(shouldConnectRealtime({ ...active, accountId: null }), false);
  assert.equal(shouldConnectRealtime({ ...active, role: 'teacher' }), false);
  assert.equal(shouldConnectRealtime({ ...active, foreground: false }), false);
  assert.equal(shouldConnectRealtime({ ...active, online: false }), false);
});

test('invalidations stay account scoped and target relevant REST queries', () => {
  const event = parseRealtimeEvent(JSON.stringify({ v: 1, type: 'message.created', occurred_at: at, data: { conversation_id: 4, message_id: 8, sender_id: 2 } }));
  assert.ok(event);
  const keys = realtimeInvalidationKeys('account-a', event);
  assert.deepEqual(keys, [
    ['account', 'account-a', 'conversations'],
    ['account', 'account-a', 'conversations', 4],
    ['account', 'account-a', 'messages', 4],
    ['account', 'account-a', 'unread'],
  ]);
  assert.ok(keys.every((key) => key[0] === 'account' && key[1] === 'account-a'));
});

test('read and changed events avoid irrelevant message invalidation', () => {
  const read = parseRealtimeEvent(JSON.stringify({ v: 1, type: 'conversation.read', occurred_at: at, data: { conversation_id: 4, message_id: 8, user_id: 2 } }));
  const changed = parseRealtimeEvent(JSON.stringify({ v: 1, type: 'conversation.changed', occurred_at: at, data: { conversation_id: 4, reason: 'locked' } }));
  assert.ok(read && changed);
  assert.deepEqual(realtimeInvalidationKeys('a', read), [['account', 'a', 'conversations'], ['account', 'a', 'conversations', 4], ['account', 'a', 'unread']]);
  assert.deepEqual(realtimeInvalidationKeys('a', changed), [['account', 'a', 'conversations'], ['account', 'a', 'conversations', 4]]);
});
