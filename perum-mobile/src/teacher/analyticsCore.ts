import type { components } from '@perum/api-schema/tenant';

export type TeacherAnalyticsPicker = components['schemas']['JournalTeacherSubjectsOut'];
export type TeacherAnalyticsClass = components['schemas']['JournalTeacherClassOut'];
export type TeacherAnalyticsPeriod = components['schemas']['ActivePeriodOut'];
export type TeacherAnalyticsPeriods = components['schemas']['ActivePeriodsOut'];
export type TeacherAnalyticsDashboard = components['schemas']['TeacherAnalyticsDashboardOut'];

export function sortedTeacherClasses(picker: TeacherAnalyticsPicker | undefined) {
  return [...(picker?.classes ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'ru', { numeric: true }));
}

export function selectTeacherClass(classes: TeacherAnalyticsClass[], selectedId: number | null) {
  return classes.some((item) => item.id === selectedId) ? selectedId : classes[0]?.id ?? null;
}

export function selectTeacherSubject(selectedClass: TeacherAnalyticsClass | undefined, selectedId: number | null) {
  return selectedClass?.subjects.some((item) => item.id === selectedId) ? selectedId : null;
}

export function academicPeriods(periods: TeacherAnalyticsPeriods | undefined) {
  return periods?.periods.filter((item) => item.period_type === 'quarter' || item.period_type === 'half_year') ?? [];
}

export function selectTeacherPeriod(periods: TeacherAnalyticsPeriods | undefined, selectedId: number | null) {
  const available = academicPeriods(periods);
  if (available.some((item) => item.id === selectedId)) return selectedId;
  const currentId = periods?.current_period?.id;
  return available.some((item) => item.id === currentId) ? currentId ?? null : available[0]?.id ?? null;
}

export function teacherPeriodsPath(classId: number) {
  return `/periods?class_id=${classId}`;
}

export function teacherAnalyticsPath(classId: number, period: TeacherAnalyticsPeriod, subjectId: number | null) {
  const params = new URLSearchParams({ class_id: String(classId), period: `${period.start_date},${period.end_date}` });
  if (subjectId !== null) params.set('subject_id', String(subjectId));
  return `/teacher/analytics/dashboard?${params.toString()}`;
}

export function formatAnalyticsDate(value: string) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return dateOnly ? `${dateOnly[3]}.${dateOnly[2]}.${dateOnly[1]}` : value;
}
