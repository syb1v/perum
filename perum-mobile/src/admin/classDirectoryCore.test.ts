import assert from 'node:assert/strict';
import test from 'node:test';
import { classDirectoryPath, classGradeLabel, classProfileLabel, classTeacherLabel, type AdminClass } from './classDirectoryCore';

const item = (overrides: Partial<AdminClass> = {}): AdminClass => ({ id: 1, name: '7 А', teacher: null, student_count: 20, bell_schedule_id: null, grade_level: 7, is_profile: 0, parent_id: null, created_at: null, ...overrides });

test('builds the exact class directory path', () => assert.equal(classDirectoryPath(), '/admin/classes'));
test('renders nullable class metadata without unsafe assumptions', () => {
  assert.equal(classTeacherLabel(item()), 'Не назначен');
  assert.equal(classTeacherLabel(item({ teacher: { id: 2, name: 'Учитель' } })), 'Учитель');
  assert.equal(classGradeLabel(item({ grade_level: null })), 'Класс без уровня');
  assert.equal(classProfileLabel(item()), null);
  assert.equal(classProfileLabel(item({ is_profile: 1 })), 'Профильный');
});
