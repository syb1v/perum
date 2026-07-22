import assert from 'node:assert/strict';
import test from 'node:test';
import { socialInvalidationKeys } from './queryKeys';

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
