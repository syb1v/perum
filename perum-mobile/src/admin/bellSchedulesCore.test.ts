import assert from 'node:assert/strict';
import test from 'node:test';
import { bellSchedulesPath, bellTimeLabel, splitBellSchedule, type AdminBellScheduleItem } from './bellSchedulesCore';

const item = (lesson_number: number, is_saturday = false, start_time: string | null = '08:00', end_time: string | null = '08:40'): AdminBellScheduleItem => ({ lesson_number, start_time, end_time, is_saturday });

test('builds the exact bell schedules path', () => assert.equal(bellSchedulesPath(), '/admin/bell-schedules'));

test('separates weekday and saturday lessons without changing server order', () => {
  const result = splitBellSchedule([item(1), item(1, true), item(2)]);
  assert.deepEqual(result.weekdays.map((entry) => entry.lesson_number), [1, 2]);
  assert.deepEqual(result.saturday.map((entry) => entry.lesson_number), [1]);
});

test('renders partial and missing bell time safely', () => {
  assert.equal(bellTimeLabel(item(1)), '08:00–08:40');
  assert.equal(bellTimeLabel(item(1, false, '08:00', null)), '08:00');
  assert.equal(bellTimeLabel(item(1, false, null, null)), 'Время не задано');
});
