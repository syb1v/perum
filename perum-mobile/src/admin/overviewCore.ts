import type { components } from '@perum/api-schema/tenant';

export type SchoolAdminOverview = components['schemas']['AdminDashboardOverviewOut'];
export type SchoolAdminRole = 'school_admin' | 'director';
export type SchoolAdminOverviewPeriod = 7 | 30 | 90 | 365;

export const schoolAdminOverviewPeriods: SchoolAdminOverviewPeriod[] = [7, 30, 90, 365];

export function canViewSchoolAdminOverview(role: string): role is SchoolAdminRole {
  return role === 'school_admin' || role === 'director';
}

export function schoolAdminOverviewPath(periodDays: SchoolAdminOverviewPeriod) {
  return `/admin/dashboard/overview?period_days=${periodDays}`;
}
