import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClientError } from '@perum/api-client';
import { queryKeys } from '../query/queryKeys';
import { classScheduleDays, classScheduleLessons, classSchedulePath, isClassNotFound, isClassScheduleUnavailable, normalizeClassId, normalizeClassScheduleDay, shouldRetryClassSchedule, type AdminClassSchedule } from './classScheduleCore';

test('builds the exact class-scoped read schedule path', () => assert.equal(classSchedulePath(42), '/admin/classes/42/schedule/read'));
test('normalizes only positive integer route ids', () => {
  assert.equal(normalizeClassId('42'), 42);
  for (const value of ['', '0', '-1', '1.2', 'today']) assert.equal(normalizeClassId(value), null);
});
test('distinguishes generic router 404, domain absence and malformed 404', () => {
  const unavailable = new ApiClientError('Not Found', 404, { detail: 'Not Found' });
  const missing = new ApiClientError('Класс не найден', 404, { detail: 'Класс не найден' });
  const malformed = new ApiClientError('missing', 404, { detail: { message: 'Not Found' } });
  assert.equal(isClassScheduleUnavailable(unavailable), true);
  assert.equal(isClassScheduleUnavailable(missing), false);
  assert.equal(isClassScheduleUnavailable(malformed), false);
  assert.equal(isClassNotFound(missing), true);
  assert.equal(isClassNotFound(unavailable), false);
  assert.equal(isClassNotFound(malformed), false);
});
test('retries only network, 408, 425, 429 and 5xx within the bounded count', () => {
  assert.equal(shouldRetryClassSchedule(0, new ApiClientError('missing', 404, { detail: 'Not Found' })), false);
  assert.equal(shouldRetryClassSchedule(0, new ApiClientError('forbidden', 403)), false);
  for (const status of [408, 425, 429, 500, 503]) assert.equal(shouldRetryClassSchedule(0, new ApiClientError('retry', status)), true);
  assert.equal(shouldRetryClassSchedule(0, new Error('network')), true);
  assert.equal(shouldRetryClassSchedule(3, new Error('network')), false);
});
test('uses six date-independent weekdays and nullable truthful lesson fields', () => {
  const schedule = { class_name: '7 А', schedule: { '0': [], '1': [], '2': [], '3': [], '4': [], '5': [{ lesson_number: 1, subject_display: null, teacher_display: null, room: null }] } } satisfies AdminClassSchedule;
  assert.deepEqual(classScheduleDays.map(day => day.key), ['0', '1', '2', '3', '4', '5']);
  assert.deepEqual(classScheduleLessons(schedule, '5')[0], { lesson_number: 1, subject_display: null, teacher_display: null, room: null });
});
test('missing days fail closed to an empty list', () => {
  const malformed = { class_name: '7 А', schedule: {} } as AdminClassSchedule;
  assert.deepEqual(classScheduleLessons(malformed, '5'), []);
});
test('filters malformed lesson numbers, keeps the first duplicate and sorts defensively', () => {
  const rows = [
    { lesson_number: 2, subject_display: 'First', teacher_display: null, room: null },
    { lesson_number: 0, subject_display: 'Invalid', teacher_display: null, room: null },
    { lesson_number: 2, subject_display: 'Duplicate', teacher_display: null, room: null },
    { lesson_number: 1, subject_display: null, teacher_display: 'Учитель', room: '1' },
    { lesson_number: 9, subject_display: 'Invalid', teacher_display: null, room: null },
    { lesson_number: 3.5, subject_display: 'Invalid', teacher_display: null, room: null },
  ] as unknown;
  assert.deepEqual(normalizeClassScheduleDay(rows), [
    { lesson_number: 1, subject_display: null, teacher_display: 'Учитель', room: '1' },
    { lesson_number: 2, subject_display: 'First', teacher_display: null, room: null },
  ]);
});
test('query key is isolated by account and class', () => {
  assert.deepEqual(queryKeys.schoolAdminClassSchedule('account-a', 7), ['account', 'account-a', 'school-admin-class-schedule', 7]);
  assert.notDeepEqual(queryKeys.schoolAdminClassSchedule('account-a', 7), queryKeys.schoolAdminClassSchedule('account-a', 8));
  assert.notDeepEqual(queryKeys.schoolAdminClassSchedule('account-a', 7), queryKeys.schoolAdminClassSchedule('account-b', 7));
});
