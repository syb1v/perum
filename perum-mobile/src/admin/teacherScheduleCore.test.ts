import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClientError } from '@perum/api-client';
import { isTeacherNotFound, isTeacherScheduleUnavailable, normalizeTeacherId, shouldRetryTeacherSchedule, teacherScheduleDays, teacherScheduleLessons, teacherSchedulePath, type AdminTeacherSchedule } from './teacherScheduleCore';

test('builds the exact teacher-scoped schedule path', () => assert.equal(teacherSchedulePath(42), '/admin/teachers/42/schedule'));
test('normalizes only positive integer route ids', () => {
  assert.equal(normalizeTeacherId('42'), 42);
  for (const value of ['', '0', '-1', '1.2', 'today']) assert.equal(normalizeTeacherId(value), null);
});
test('distinguishes generic router 404, domain absence and malformed 404', () => {
  const unavailable = new ApiClientError('Not Found', 404, { detail: 'Not Found' });
  const missing = new ApiClientError('Учитель не найден', 404, { detail: 'Учитель не найден' });
  const malformed = new ApiClientError('missing', 404, { detail: { message: 'Not Found' } });
  assert.equal(isTeacherScheduleUnavailable(unavailable), true);
  assert.equal(isTeacherScheduleUnavailable(missing), false);
  assert.equal(isTeacherScheduleUnavailable(malformed), false);
  assert.equal(isTeacherNotFound(missing), true);
  assert.equal(isTeacherNotFound(unavailable), false);
  assert.equal(isTeacherNotFound(malformed), false);
});
test('retries only network, 408, 425, 429 and 5xx within the bounded count', () => {
  assert.equal(shouldRetryTeacherSchedule(0, new ApiClientError('missing', 404, { detail: 'Not Found' })), false);
  assert.equal(shouldRetryTeacherSchedule(0, new ApiClientError('forbidden', 403)), false);
  for (const status of [408, 425, 429, 500, 503]) assert.equal(shouldRetryTeacherSchedule(0, new ApiClientError('retry', status)), true);
  assert.equal(shouldRetryTeacherSchedule(0, new ApiClientError('server', 500)), true);
  assert.equal(shouldRetryTeacherSchedule(0, new Error('network')), true);
  assert.equal(shouldRetryTeacherSchedule(3, new Error('network')), false);
});
test('uses six authoritative weekdays without date-dependent normalization', () => {
  const schedule = { teacher_id: 1, teacher_name: 'Учитель', schedule: { '0': [], '1': [], '2': [], '3': [], '4': [], '5': [{ id: 9, lesson_number: 1, subject_id: 2, subject_name: null, class_id: 3, class_name: null, room: null }] } } satisfies AdminTeacherSchedule;
  assert.deepEqual(teacherScheduleDays.map(day => day.key), ['0', '1', '2', '3', '4', '5']);
  assert.equal(teacherScheduleLessons(schedule, '5')[0]?.id, 9);
});
