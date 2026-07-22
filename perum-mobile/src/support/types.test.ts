import assert from 'node:assert/strict';
import test from 'node:test';
import { supportMessageCreatePayload, supportReadPayload, supportTicketCreatePayload, type SupportMutation, type SupportReadMutation, type SupportTicketCreateMutation } from './types';

const base = { id: 'local-1', accountId: 'account-a', state: 'pending', attempts: 0, nextAttemptAt: 0, error: null, createdAt: 1 } as const;

test('requester support payloads preserve durable client identities', () => {
  const message: SupportMutation = { ...base, ticketId: 'ticket-1', clientMessageId: 'message-1', body: 'Reply' };
  const read: SupportReadMutation = { ...base, ticketId: 'ticket-1', messageId: 'message-server-1', clientActionId: 'read-1' };
  const ticket: SupportTicketCreateMutation = { ...base, clientTicketId: 'ticket-client-1', clientMessageId: 'message-client-1', category: 'technical', subject: 'Subject', body: 'Body', serverTicketId: null };
  assert.deepEqual(supportMessageCreatePayload(message), { client_message_id: 'message-1', body: 'Reply' });
  assert.deepEqual(supportReadPayload(read), { client_action_id: 'read-1', message_id: 'message-server-1' });
  assert.deepEqual(supportTicketCreatePayload(ticket), { client_ticket_id: 'ticket-client-1', client_message_id: 'message-client-1', category: 'technical', subject: 'Subject', body: 'Body' });
});
