import assert from 'node:assert/strict';
import test from 'node:test';
import { canViewSchoolAdminOverview, schoolAdminOverviewPath, schoolAdminOverviewPeriods } from './overviewCore';

test('school overview allows only exact tenant operator roles', () => {
  assert.equal(canViewSchoolAdminOverview('school_admin'), true);
  assert.equal(canViewSchoolAdminOverview('director'), true);
  for (const role of ['admin', 'org_admin', 'teacher', 'student', 'parent']) assert.equal(canViewSchoolAdminOverview(role), false);
});

test('school overview uses only bounded product periods', () => {
  assert.deepEqual(schoolAdminOverviewPeriods, [7, 30, 90, 365]);
  assert.equal(schoolAdminOverviewPath(30), '/admin/dashboard/overview?period_days=30');
});
