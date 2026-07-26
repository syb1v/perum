import assert from 'node:assert/strict';
import test from 'node:test';
import { hasCapabilities, hasCapability } from './capabilities';
import type { TenantAccount } from './types';

const base = { descriptorCapabilities: { social_messages: true, social_realtime: false, student_academics: true, student_analytics: true, parent_academics: true, parent_analytics: true, teacher_diary: true, teacher_homeroom: true, teacher_works: true, teacher_analytics: true, school_admin_overview: true, school_admin_social_moderation: true, school_admin_academic_calendar: true, school_admin_class_directory: true, school_admin_teacher_directory: true, school_admin_bell_schedules: true } } as TenantAccount;

test('capability selectors are fail closed', () => {
  assert.equal(hasCapability(base, 'social_messages'), true);
  assert.equal(hasCapability(base, 'student_academics'), true);
  assert.equal(hasCapability(base, 'student_analytics'), true);
  assert.equal(hasCapability(base, 'parent_academics'), true);
  assert.equal(hasCapability(base, 'parent_analytics'), true);
  assert.equal(hasCapability(base, 'teacher_diary'), true);
  assert.equal(hasCapability(base, 'teacher_homeroom'), true);
  assert.equal(hasCapability(base, 'teacher_works'), true);
  assert.equal(hasCapability(base, 'teacher_analytics'), true);
  assert.equal(hasCapability(base, 'school_admin_overview'), true);
  assert.equal(hasCapability(base, 'school_admin_social_moderation'), true);
  assert.equal(hasCapability(base, 'school_admin_academic_calendar'), true);
  assert.equal(hasCapability(base, 'school_admin_class_directory'), true);
  assert.equal(hasCapability(base, 'school_admin_teacher_directory'), true);
  assert.equal(hasCapability(base, 'school_admin_bell_schedules'), true);
  assert.equal(hasCapability(base, 'social_realtime'), false);
  assert.equal(hasCapability(null, 'social_messages'), false);
  assert.equal(hasCapabilities(base, ['social_messages', 'social_realtime']), false);
});

test('capabilities remain account specific', () => {
  const other = { descriptorCapabilities: { social_messages: false } } as TenantAccount;
  assert.equal(hasCapability(base, 'social_messages'), true);
  assert.equal(hasCapability(other, 'social_messages'), false);
});
