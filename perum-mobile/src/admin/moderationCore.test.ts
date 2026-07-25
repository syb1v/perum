import assert from 'node:assert/strict';
import test from 'node:test';
import { canViewSchoolModeration, mergeModerationCases, moderationCasePath, moderationCasesPath, type ModerationCasePage } from './moderationCore';

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
  assert.equal(moderationCasePath(0), null);
});

test('moderation removes overlapping cursor rows', () => {
  assert.deepEqual(mergeModerationCases([page([3, 2], 2), page([2, 1], null)]).map((item) => item.id), [3, 2, 1]);
});
