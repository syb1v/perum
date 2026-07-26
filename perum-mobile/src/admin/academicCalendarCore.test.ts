import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarPeriodsPath, calendarYearsPath, formatCalendarDate, groupPeriodsByYear, type AcademicYear, type SchoolPeriod } from './academicCalendarCore';

const year = (id: number, current = false): AcademicYear => ({ id, name: `${id}`, start_date: '2025-09-01T00:00:00', end_date: '2026-05-31T00:00:00', is_current: current });
const period = (id: number, yearId: number): SchoolPeriod => ({ id, name: `Период ${id}`, period_type: 'quarter', start_date: '2025-09-01T00:00:00', end_date: '2025-10-01T00:00:00', is_active: true, academic_year_id: yearId, target_grades: null });

test('builds exact administrative calendar paths', () => {
  assert.equal(calendarYearsPath(), '/admin/academic-years');
  assert.equal(calendarPeriodsPath(), '/admin/school-periods');
});

test('groups only periods belonging to returned school years', () => {
  assert.deepEqual(groupPeriodsByYear([year(1, true), year(2)], [period(10, 1), period(11, 99)]).map((item) => item.periods.map((entry) => entry.id)), [[10], []]);
});

test('formats date-time calendar values safely', () => {
  assert.equal(formatCalendarDate('2026-07-25T00:00:00'), '25.07.2026');
  assert.equal(formatCalendarDate('invalid'), 'invalid');
});
