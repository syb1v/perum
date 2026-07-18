import assert from 'node:assert/strict';
import test from 'node:test';
import { appendUniqueStudents } from './types';

test('appendUniqueStudents preserves order and removes page overlap', () => {
  const one = { id: 1, name: 'One', avatar: null, class_name: '7A' };
  const two = { id: 2, name: 'Two', avatar: null, class_name: '7A' };
  assert.deepEqual(appendUniqueStudents([one], [one, two]), [one, two]);
});
