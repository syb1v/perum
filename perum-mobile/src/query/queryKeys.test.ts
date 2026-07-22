import assert from 'node:assert/strict';
import test from 'node:test';
import { adminSupportInvalidationKeys, socialInvalidationKeys, supportInvalidationKeys } from './queryKeys';

test('social invalidation plans stay account scoped and exclude unrelated families', () => {
  const plans = [
    socialInvalidationKeys.reconnect('account-a'),
    socialInvalidationKeys.messageCreated('account-a', 7),
    socialInvalidationKeys.messageSent('account-a'),
    socialInvalidationKeys.conversationRead('account-a', 7),
    socialInvalidationKeys.conversationChanged('account-a', 7),
  ];
  for (const keys of plans) {
    assert.ok(keys.every(key => key[0] === 'account' && key[1] === 'account-a'));
    assert.ok(keys.every(key => !key.includes('support') && !key.includes('support-admin') && !key.includes('homework')));
  }
  assert.deepEqual(socialInvalidationKeys.messageSent('account-a'), [
    ['account', 'account-a', 'conversations'],
    ['account', 'account-a', 'messages'],
  ]);
  assert.notDeepEqual(socialInvalidationKeys.reconnect('account-a'), socialInvalidationKeys.reconnect('account-b'));
});

test('requester and admin support plans stay in separate account-scoped families', () => {
  const requester = [
    supportInvalidationKeys.ticketCreated('account-a'),
    supportInvalidationKeys.replySent('account-a', 'ticket-1'),
    supportInvalidationKeys.ticketRead('account-a'),
  ];
  const admin = [
    adminSupportInvalidationKeys.ticketChanged('account-a'),
    adminSupportInvalidationKeys.replySent('account-a', 'ticket-1'),
    adminSupportInvalidationKeys.ticketRead('account-a'),
  ];
  assert.ok(requester.flat().every(key => key[0] === 'account' && key[1] === 'account-a' && key[2] === 'support'));
  assert.ok(admin.flat().every(key => key[0] === 'account' && key[1] === 'account-a' && key[2] === 'support-admin'));
  assert.ok(requester.flat().every(key => !key.includes('unread')));
  assert.ok(admin.flat().every(key => !key.includes('messages') || key.join(':') === 'account:account-a:support-admin:messages:ticket-1'));
  assert.deepEqual(adminSupportInvalidationKeys.ticketRead('account-a'), [
    ['account', 'account-a', 'support-admin', 'tickets'],
    ['account', 'account-a', 'support-admin', 'unread'],
  ]);
  assert.notDeepEqual(supportInvalidationKeys.replySent('account-a', 'ticket-1'), supportInvalidationKeys.replySent('account-b', 'ticket-1'));
});
