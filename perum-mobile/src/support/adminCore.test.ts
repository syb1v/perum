import assert from 'node:assert/strict';
import test from 'node:test';
import { adminMessageLabel, canReplyToAdminTicket, canUseAdminSupport } from './adminCore';

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

test('admin reply is online only and closed tickets stay read only', () => {
  assert.equal(canReplyToAdminTicket('open', true), true);
  assert.equal(canReplyToAdminTicket('open', false), false);
  assert.equal(canReplyToAdminTicket('closed', true), false);
});
