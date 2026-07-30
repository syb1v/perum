import assert from 'node:assert/strict';
import test from 'node:test';
import { canViewSchoolModeration, createModerationActionAttempt, isModerationConflict, matchesModerationActionAttempt, mergeModerationCases, MODERATION_ACTIONS, MODERATION_REASON_MAX_LENGTH, moderationActionPath, moderationCasePath, moderationCasesPath, moderationInvalidationTargets, moderationReasonError, type ModerationCasePage } from './moderationCore';

const page = (ids: number[], next: number | null): ModerationCasePage => ({ items: ids.map((id) => ({ id, status: 'open', version: 1, created_at: '2026-07-25T12:00:00Z', updated_at: '2026-07-25T12:00:00Z' })), next_cursor: next });

test('moderation allows only exact school operator roles', () => {
  assert.equal(canViewSchoolModeration('school_admin'), true);
  assert.equal(canViewSchoolModeration('director'), true);
  for (const role of ['admin', 'org_admin', 'platform_admin', 'teacher', 'student', 'parent']) assert.equal(canViewSchoolModeration(role), false);
});

test('moderation builds bounded cursor paths and rejects invalid ids', () => {
  assert.equal(moderationCasesPath(null), '/admin/social/moderation/cases?limit=20');
  assert.equal(moderationCasesPath(42), '/admin/social/moderation/cases?limit=20&cursor=42');
  assert.equal(moderationCasePath(7), '/admin/social/moderation/cases/7');
  assert.equal(moderationActionPath(7), '/admin/social/moderation/cases/7/actions');
  assert.equal(moderationCasePath(0), null);
  assert.equal(moderationActionPath(0), null);
});

test('moderation removes overlapping cursor rows', () => {
  assert.deepEqual(mergeModerationCases([page([3, 2], 2), page([2, 1], null)]).map((item) => item.id), [3, 2, 1]);
});

test('moderation action literals and payload match the tenant contract', () => {
  assert.deepEqual(MODERATION_ACTIONS, ['dismiss', 'hide_reported_message', 'lock_conversation', 'unlock_conversation']);
  const attempt = createModerationActionAttempt('hide_reported_message', '  Нарушение подтверждено  ', 4, () => 'action-1');
  assert.deepEqual(attempt.payload, { action: 'hide_reported_message', reason: 'Нарушение подтверждено', client_action_id: 'action-1', expected_version: 4 });
});

test('moderation validates a non-empty trimmed backend-bounded reason', () => {
  assert.equal(moderationReasonError('  '), 'Укажите причину действия.');
  assert.equal(moderationReasonError('x'.repeat(MODERATION_REASON_MAX_LENGTH)), null);
  assert.match(moderationReasonError(` ${'x'.repeat(MODERATION_REASON_MAX_LENGTH + 1)} `) ?? '', /1000/);
});

test('moderation keeps one id stable inside a submitted attempt', () => {
  let calls = 0;
  const attempt = createModerationActionAttempt('dismiss', 'Причина', 2, () => `action-${++calls}`);
  assert.equal(calls, 1);
  assert.equal(attempt.clientActionId, 'action-1');
  assert.equal(attempt.payload.client_action_id, attempt.clientActionId);
  assert.equal(attempt.payload.client_action_id, 'action-1');
});

test('moderation reuses an uncertain attempt only while the form is unchanged', () => {
  const attempt = createModerationActionAttempt('dismiss', '  Причина  ', 2, () => 'action-1');
  assert.equal(matchesModerationActionAttempt(attempt, 'dismiss', 'Причина'), true);
  assert.equal(matchesModerationActionAttempt(attempt, 'dismiss', 'Другая причина'), false);
  assert.equal(matchesModerationActionAttempt(attempt, 'lock_conversation', 'Причина'), false);
});

test('moderation classifies every HTTP 409 and only HTTP 409 as a conflict', () => {
  assert.equal(isModerationConflict({ status: 409 }), true);
  assert.equal(isModerationConflict({ status: 409, originalErrorData: null }), true);
  assert.equal(isModerationConflict({ status: 422 }), false);
  assert.equal(isModerationConflict(new TypeError('offline')), false);
});

test('moderation invalidation targets remain account scoped', () => {
  assert.deepEqual(moderationInvalidationTargets('account-1', 7), [
    ['account', 'account-1', 'school-admin-moderation'],
    ['account', 'account-1', 'school-admin-moderation', 'case', 7],
  ]);
});
