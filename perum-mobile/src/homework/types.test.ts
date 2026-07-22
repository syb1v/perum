import assert from 'node:assert/strict';
import test from 'node:test';
import { studentHomework, type HomeworkList } from './types';

const base = { id: 1, class_id: 1, class_name: '5A', subject_id: 1, subject_name: 'Math', title: 'Task', description: null, due_date: null, assigned_occurrence_id: null, target_occurrence_id: null, published_at: null, deadline_at: null, is_overdue: false, created_at: null, attachments: [] };

test('student homework fails closed when a role-shaped row has no student state', () => {
  const list: HomeworkList = { homework: [
    { ...base, student_state: null },
    { ...base, id: 2, student_state: { status: 'not_started', version: 0, completed_at: null } },
  ] };
  assert.deepEqual(studentHomework(list).map(item => item.id), [2]);
});
