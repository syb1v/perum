import type { components } from '@perum/api-schema/tenant';

export type StudentGradesSummary = components['schemas']['GradesSummaryOut'];
export type StudentGradesAnalytics = components['schemas']['GradesAnalyticsOut'];

export function studentSummaryPath() { return '/student/grades/summary'; }
export function studentAnalyticsPath() { return '/student/grades/analytics'; }

export function studentPeriodGrade(periods: Record<string, number | null>, periodId: number) {
  return periods[String(periodId)] ?? null;
}
