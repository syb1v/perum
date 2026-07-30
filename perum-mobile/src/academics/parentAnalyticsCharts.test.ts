import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPeriodCharts, buildSubjectAverageChart, formatChartMetric, normalizeGrade } from './parentAnalyticsCharts';
import type { ParentGradesAnalytics, ParentGradesSummary } from './parentAnalyticsCore';

test('normalizes only finite grades inside the closed 1..5 scale', () => {
  assert.deepEqual(normalizeGrade(1), { value: 1, valueText: '1', percent: 0 });
  assert.deepEqual(normalizeGrade(3), { value: 3, valueText: '3', percent: 50 });
  assert.deepEqual(normalizeGrade(5), { value: 5, valueText: '5', percent: 100 });
});

test('treats missing, malformed and out-of-range grades as missing with no bar width', () => {
  assert.deepEqual(normalizeGrade(null), { value: null, valueText: 'Нет оценки', percent: 0 });
  assert.deepEqual(normalizeGrade(Number.NaN), { value: null, valueText: 'Нет оценки', percent: 0 });
  assert.deepEqual(normalizeGrade(Number.POSITIVE_INFINITY), { value: null, valueText: 'Нет оценки', percent: 0 });
  assert.deepEqual(normalizeGrade('4'), { value: null, valueText: 'Нет оценки', percent: 0 });
  assert.deepEqual(normalizeGrade(0.99), { value: null, valueText: 'Нет оценки', percent: 0 });
  assert.deepEqual(normalizeGrade(5.01), { value: null, valueText: 'Нет оценки', percent: 0 });
});

test('formats generated numeric metrics truthfully and fails missing for malformed scalars', () => {
  assert.equal(formatChartMetric(0), '0');
  assert.equal(formatChartMetric(-2.5), '-2.5');
  assert.equal(formatChartMetric(Number.NaN), 'не указано');
  assert.equal(formatChartMetric('3'), 'не указано');
});

test('keeps subject order stable and builds child-scoped accessible labels', () => {
  const summary = {
    total_points: 12,
    total_grades: 3,
    subjects: [
      { subject_id: 8, subject_name: 'Физика', average: 4.5, count: 2, points: 8 },
      { subject_id: 3, subject_name: 'Алгебра', average: 4, count: 1, points: 4 },
    ],
  } satisfies ParentGradesSummary;
  const chart = buildSubjectAverageChart(summary, 'Анна Иванова');
  assert.deepEqual(chart.map((item) => item.subjectId), [8, 3]);
  assert.equal(chart[0]?.valueText, '4.5');
  assert.equal(chart[0]?.detailText, '2 оценок · 8 баллов');
  assert.equal(chart[0]?.accessibilityLabel, 'Анна Иванова, Физика, средний балл: 4.5 из 5, 2 оценок · 8 баллов');
});

test('uses the exact safely formatted visible detail in the subject accessibility label', () => {
  const summary = {
    total_points: 0,
    total_grades: 0,
    subjects: [{ subject_id: 1, subject_name: 'Музыка', average: 6, count: Number.NaN, points: Number.POSITIVE_INFINITY }],
  } satisfies ParentGradesSummary;
  const [item] = buildSubjectAverageChart(summary, 'Иван Петров');
  assert.equal(item?.detailText, 'не указано оценок · не указано баллов');
  assert.equal(item?.accessibilityLabel, 'Иван Петров, Музыка, средний балл: нет оценки, не указано оценок · не указано баллов');
});

test('maps authoritative periods by id in stable order and never interpolates missing values', () => {
  const analytics = {
    period_type: 'quarter',
    current_period: 20,
    periods: [
      { id: 20, name: 'II четверть', start_date: '2026-11-01', end_date: '2026-12-31' },
      { id: 10, name: 'I четверть', start_date: '2026-09-01', end_date: '2026-10-31' },
      { id: 30, name: 'III четверть', start_date: '2027-01-01', end_date: '2027-03-31' },
    ],
    subjects: [{ subject_id: 1, subject_name: 'Русский язык', periods: { '10': 3.5, '20': null }, year_average: 3.5 }],
  } satisfies ParentGradesAnalytics;
  const [subject] = buildPeriodCharts(analytics, 'Анна Иванова');
  assert.deepEqual(subject?.periods.map((period) => period.periodId), [20, 10, 30]);
  assert.deepEqual(subject?.periods.map((period) => period.value), [null, 3.5, null]);
  assert.equal(subject?.periods[0]?.accessibilityLabel, 'Анна Иванова, Русский язык, II четверть: нет оценки');
  assert.equal(subject?.periods[1]?.accessibilityLabel, 'Анна Иванова, Русский язык, I четверть: 3.5 из 5');
});
