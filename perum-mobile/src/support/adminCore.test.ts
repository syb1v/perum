import assert from 'node:assert/strict';
import test from 'node:test';
import { adminMessageLabel, adminTicketActionPath, adminTicketActionPayload, adminTicketReplyPath, canQueueAdminReply, canUseAdminSupport, escalationDeliveryLabel, isVersionConflict } from './adminCore';

test('admin support requires its capability and an exact school operator role', () => {
  assert.equal(canUseAdminSupport('school_admin', true), true);
  assert.equal(canUseAdminSupport('director', true), true);
  assert.equal(canUseAdminSupport('admin', true), false);
  assert.equal(canUseAdminSupport('teacher', true), false);
  assert.equal(canUseAdminSupport('school_admin', false), false);
});

test('admin thread preserves requester, school, and organization boundaries', () => {
  assert.equal(adminMessageLabel('requester'), 'Пользователь');
  assert.equal(adminMessageLabel('shared_inbox'), 'Школа');
  assert.equal(adminMessageLabel('admin_inbox'), 'Организация');
});

test('admin reply can queue offline while closed tickets stay read only', () => {
  assert.equal(canQueueAdminReply('open', true), true);
  assert.equal(canQueueAdminReply('open', false), false);
  assert.equal(canQueueAdminReply('closed', true), false);
});

test('metadata and assignment actions carry version and stable idempotency identity', () => {
  const metadata = { kind: 'metadata', field: 'priority', value: 'urgent' } as const;
  assert.equal(adminTicketActionPath('ticket-1', metadata), '/admin/support/tickets/ticket-1');
  assert.deepEqual(adminTicketActionPayload(metadata, 4, 'action-1'), { client_action_id: 'action-1', expected_version: 4, priority: 'urgent' });
  const assignment = { kind: 'assignment', assigneeId: 7 } as const;
  assert.equal(adminTicketActionPath('ticket-1', assignment), '/admin/support/tickets/ticket-1/assign');
  assert.deepEqual(adminTicketActionPayload(assignment, 5, 'action-2'), { client_action_id: 'action-2', expected_version: 5, assignee_id: 7 });
});

test('admin replies use only the school operator endpoint', () => {
  assert.equal(adminTicketReplyPath('ticket-1'), '/admin/support/tickets/ticket-1/messages');
});

test('only structured version conflicts trigger server snapshot refresh', () => {
  assert.equal(isVersionConflict({ status: 409, originalErrorData: { detail: { code: 'VERSION_CONFLICT' } } }), true);
  assert.equal(isVersionConflict({ status: 409, originalErrorData: { detail: 'client_action_id reused' } }), false);
  assert.equal(isVersionConflict({ status: 500 }), false);
});

test('delivery labels expose only truthful persisted states', () => {
  assert.equal(escalationDeliveryLabel('pending'), 'Ожидает отправки');
  assert.equal(escalationDeliveryLabel('retrying'), 'Повторная отправка');
  assert.equal(escalationDeliveryLabel('delivered'), 'Доставлено в PERUM');
});
