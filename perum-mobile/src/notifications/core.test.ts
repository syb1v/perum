import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationTarget, type NotificationItem } from './core';

const item = (refType: string | null, refId: string | null): NotificationItem => ({ id: 1, title: 'Ответ', text: 'Текст', type: 'support', ref_type: refType, ref_id: refId, is_read: false, created_at: '2026-07-22T10:00:00' });

test('support notification routes only exact school operator roles and reference', () => {
  assert.deepEqual(notificationTarget('school_admin', true, item('admin_support_ticket', 'ticket-1')), { pathname: '/admin-support/[ticketId]', params: { ticketId: 'ticket-1' } });
  assert.deepEqual(notificationTarget('director', true, item('admin_support_ticket', 'ticket-2')), { pathname: '/admin-support/[ticketId]', params: { ticketId: 'ticket-2' } });
  assert.equal(notificationTarget('teacher', true, item('admin_support_ticket', 'ticket-1')), null);
  assert.equal(notificationTarget('school_admin', false, item('admin_support_ticket', 'ticket-1')), null);
  assert.equal(notificationTarget('school_admin', true, item('unknown', 'ticket-1')), null);
  assert.equal(notificationTarget('school_admin', true, item('admin_support_ticket', null)), null);
});
