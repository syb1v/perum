import assert from 'node:assert/strict';
import test from 'node:test';
import { isSchoolAdmin, isSchoolSupportOperator } from '../src/index.ts';

test('school support operators exclude the legacy admin role', () => {
  assert.equal(isSchoolSupportOperator('school_admin'), true);
  assert.equal(isSchoolSupportOperator('director'), true);
  assert.equal(isSchoolSupportOperator('admin'), false);
  assert.equal(isSchoolSupportOperator('teacher'), false);
  assert.equal(isSchoolSupportOperator(null), false);
  assert.equal(isSchoolSupportOperator(undefined), false);
});

test('general school admin policy keeps its wider legacy boundary', () => {
  assert.equal(isSchoolAdmin('admin'), true);
  assert.equal(isSchoolAdmin('school_admin'), true);
  assert.equal(isSchoolAdmin('director'), true);
});
