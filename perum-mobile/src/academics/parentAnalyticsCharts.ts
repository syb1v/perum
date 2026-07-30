import type { ParentGradesAnalytics, ParentGradesSummary } from './parentAnalyticsCore';

export const GRADE_SCALE_MIN = 1;
export const GRADE_SCALE_MAX = 5;

export type GradeChartValue = {
  value: number | null;
  valueText: string;
  percent: number;
};

export type SubjectAverageChartItem = GradeChartValue & {
  subjectId: number;
  subjectName: string;
  detailText: string;
  accessibilityLabel: string;
};

export type PeriodChartItem = GradeChartValue & {
  periodId: number;
  periodName: string;
  accessibilityLabel: string;
};

export type PeriodSubjectChart = {
  subjectId: number;
  subjectName: string;
  yearValueText: string;
  periods: PeriodChartItem[];
};

export function normalizeGrade(value: unknown): GradeChartValue {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < GRADE_SCALE_MIN || value > GRADE_SCALE_MAX) {
    return { value: null, valueText: 'Нет оценки', percent: 0 };
  }
  return {
    value,
    valueText: String(value),
    percent: ((value - GRADE_SCALE_MIN) / (GRADE_SCALE_MAX - GRADE_SCALE_MIN)) * 100,
  };
}

export function formatChartMetric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'не указано';
}

export function buildSubjectAverageChart(summary: ParentGradesSummary, childName: string): SubjectAverageChartItem[] {
  return summary.subjects.map((subject) => {
    const grade = normalizeGrade(subject.average);
    const detailText = `${formatChartMetric(subject.count)} оценок · ${formatChartMetric(subject.points)} баллов`;
    return {
      ...grade,
      subjectId: subject.subject_id,
      subjectName: subject.subject_name,
      detailText,
      accessibilityLabel: `${childName}, ${subject.subject_name}, средний балл: ${grade.value === null ? 'нет оценки' : `${grade.value} из 5`}, ${detailText}`,
    };
  });
}

export function buildPeriodCharts(analytics: ParentGradesAnalytics, childName: string): PeriodSubjectChart[] {
  return analytics.subjects.map((subject) => ({
    subjectId: subject.subject_id,
    subjectName: subject.subject_name,
    yearValueText: normalizeGrade(subject.year_average).valueText,
    periods: analytics.periods.map((period) => {
      const grade = normalizeGrade(subject.periods[String(period.id)]);
      return {
        ...grade,
        periodId: period.id,
        periodName: period.name,
        accessibilityLabel: `${childName}, ${subject.subject_name}, ${period.name}: ${grade.value === null ? 'нет оценки' : `${grade.value} из 5`}`,
      };
    }),
  }));
}
