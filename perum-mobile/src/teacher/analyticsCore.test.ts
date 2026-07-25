import assert from 'node:assert/strict';
import test from 'node:test';
import { academicPeriods, formatAnalyticsDate, selectTeacherClass, selectTeacherPeriod, selectTeacherSubject, sortedTeacherClasses, teacherAnalyticsPath, teacherPeriodsPath, type TeacherAnalyticsClass, type TeacherAnalyticsPeriods } from './analyticsCore';

const subject = (id: number) => ({ id, name: `Предмет ${id}`, short_name: null, category: 'general' });
const classItem = (id: number, name: string, subjectIds: number[] = []): TeacherAnalyticsClass => ({ id, name, grade_level: null, subjects: subjectIds.map(subject) });
const periods: TeacherAnalyticsPeriods = { current_period: { id: 2, name: 'II четверть', period_type: 'quarter', start_date: '2026-11-01', end_date: '2026-12-30' }, periods: [{ id: 3, name: 'Каникулы', period_type: 'vacation', start_date: '2026-10-01', end_date: '2026-10-07' }, { id: 1, name: 'I четверть', period_type: 'quarter', start_date: '2026-09-01', end_date: '2026-10-30' }, { id: 2, name: 'II четверть', period_type: 'quarter', start_date: '2026-11-01', end_date: '2026-12-30' }] };

test('sorts classes naturally and keeps a valid class selection', () => {
  const classes = sortedTeacherClasses({ classes: [classItem(2, '10 Б'), classItem(1, '2 А')] });
  assert.deepEqual(classes.map((item) => item.id), [1, 2]);
  assert.equal(selectTeacherClass(classes, 2), 2);
  assert.equal(selectTeacherClass(classes, 99), 1);
  assert.equal(selectTeacherClass([], 1), null);
});

test('keeps only subjects assigned to the selected class', () => {
  const selectedClass = classItem(1, '7 А', [10, 20]);
  assert.equal(selectTeacherSubject(selectedClass, 20), 20);
  assert.equal(selectTeacherSubject(selectedClass, 30), null);
  assert.equal(selectTeacherSubject(undefined, 10), null);
});

test('filters academic periods and prefers the authoritative current period', () => {
  assert.deepEqual(academicPeriods(periods).map((item) => item.id), [1, 2]);
  assert.equal(selectTeacherPeriod(periods, null), 2);
  assert.equal(selectTeacherPeriod(periods, 1), 1);
  assert.equal(selectTeacherPeriod({ current_period: null, periods: [] }, 1), null);
});

test('builds selector and dashboard paths from exact filter values', () => {
  const period = periods.periods[1]!;
  assert.equal(teacherPeriodsPath(7), '/periods?class_id=7');
  assert.equal(teacherAnalyticsPath(7, period, null), '/teacher/analytics/dashboard?class_id=7&period=2026-09-01%2C2026-10-30');
  assert.equal(teacherAnalyticsPath(7, period, 11), '/teacher/analytics/dashboard?class_id=7&period=2026-09-01%2C2026-10-30&subject_id=11');
  assert.equal(formatAnalyticsDate('2026-09-01T00:00:00'), '01.09.2026');
});
