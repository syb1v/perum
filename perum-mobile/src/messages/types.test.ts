import assert from 'node:assert/strict';
import test from 'node:test';
import { messageCreatePayload, messageReadPayload, type MessageMutation, type SocialReadMutation } from './types';

const mutation = {
  id: 'local-1', accountId: 'account-a', state: 'pending', attempts: 0,
  nextAttemptAt: 0, error: null, createdAt: 1,
} as const;

test('social mutation payloads preserve immutable outbox identities', () => {
  const message: MessageMutation = { ...mutation, conversationId: 7, clientMessageId: 'message-1', body: 'Text' };
  const read: SocialReadMutation = { ...mutation, conversationId: 7, messageId: 11, clientActionId: 'read-1' };
  assert.deepEqual(messageCreatePayload(message), { client_message_id: 'message-1', body: 'Text' });
  assert.deepEqual(messageReadPayload(read), { message_id: 11, client_action_id: 'read-1' });
});
