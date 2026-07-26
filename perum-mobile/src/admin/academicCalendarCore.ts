import type { components } from '@perum/api-schema/tenant';

export type AcademicYears = components['schemas']['AdminAcademicYearsOut'];
export type SchoolPeriods = components['schemas']['AdminSchoolPeriodsOut'];
export type AcademicYear = components['schemas']['AdminAcademicYearOut'];
export type SchoolPeriod = components['schemas']['AdminSchoolPeriodOut'];

export function calendarYearsPath() { return '/admin/academic-years'; }
export function calendarPeriodsPath() { return '/admin/school-periods'; }

export function groupPeriodsByYear(years: AcademicYear[], periods: SchoolPeriod[]) {
  const knownYears = new Set(years.map((year) => year.id));
  const grouped = new Map<number, SchoolPeriod[]>();
  for (const period of periods) {
    if (!knownYears.has(period.academic_year_id)) continue;
    grouped.set(period.academic_year_id, [...(grouped.get(period.academic_year_id) ?? []), period]);
  }
  return years.map((year) => ({ year, periods: grouped.get(year.id) ?? [] }));
}

export function formatCalendarDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
}
