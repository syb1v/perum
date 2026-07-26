import assert from 'node:assert/strict';
import test from 'node:test';
import { teacherAssignmentLabel, teacherDirectoryPath, type AdminTeacherDirectoryTeacher } from './teacherDirectoryCore';

const teacher = (assignments: AdminTeacherDirectoryTeacher['assignments'] = []): AdminTeacherDirectoryTeacher => ({ id: 1, name: 'Учитель', assignments });

test('builds the exact teacher directory path', () => assert.equal(teacherDirectoryPath(), '/admin/teacher-directory'));
test('renders assignment count without exposing legacy ids or contact data', () => {
  assert.equal(teacherAssignmentLabel(teacher()), 'Назначений нет');
  assert.equal(teacherAssignmentLabel(teacher([{ subject: { id: 1, name: 'Математика' }, class: { id: 2, name: '7 А' } }])), '1 назнач.');
});
