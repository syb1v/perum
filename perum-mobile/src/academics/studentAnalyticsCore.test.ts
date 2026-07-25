import assert from 'node:assert/strict';
import test from 'node:test';
import { studentAnalyticsPath, studentPeriodGrade, studentSummaryPath } from './studentAnalyticsCore';

test('uses exact student analytics routes', () => {
  assert.equal(studentSummaryPath(), '/student/grades/summary');
  assert.equal(studentAnalyticsPath(), '/student/grades/analytics');
});

test('reads nullable period values by stringified id', () => {
  assert.equal(studentPeriodGrade({ '3': 4.2 }, 3), 4.2);
  assert.equal(studentPeriodGrade({ '3': null }, 3), null);
  assert.equal(studentPeriodGrade({}, 3), null);
});
