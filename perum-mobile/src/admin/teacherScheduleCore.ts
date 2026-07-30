import type { ApiClient } from '@perum/api-client';
import { ApiClientError } from '@perum/api-client';
import type { components } from '@perum/api-schema/tenant';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query/queryKeys';

export type AdminTeacherSchedule = components['schemas']['AdminTeacherScheduleOut'];
export type AdminTeacherScheduleLesson = components['schemas']['AdminTeacherScheduleLessonOut'];

export const teacherScheduleDays = [
  { key: '0', name: 'Понедельник' },
  { key: '1', name: 'Вторник' },
  { key: '2', name: 'Среда' },
  { key: '3', name: 'Четверг' },
  { key: '4', name: 'Пятница' },
  { key: '5', name: 'Суббота' },
] as const;

export function normalizeTeacherId(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function teacherSchedulePath(teacherId: number) { return `/admin/teachers/${teacherId}/schedule`; }
function errorDetail(error: ApiClientError) {
  const data = error.originalErrorData;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !('detail' in data)) return null;
  return (data as { detail?: unknown }).detail;
}

export function isTeacherScheduleUnavailable(error: unknown) { return error instanceof ApiClientError && error.status === 404 && errorDetail(error) === 'Not Found'; }
export function isTeacherNotFound(error: unknown) { return error instanceof ApiClientError && error.status === 404 && errorDetail(error) === 'Учитель не найден'; }
export function shouldRetryTeacherSchedule(failureCount: number, error: unknown) {
  if (failureCount >= 3) return false;
  if (!(error instanceof ApiClientError)) return true;
  return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}
export function teacherScheduleLessons(schedule: AdminTeacherSchedule, day: typeof teacherScheduleDays[number]['key']) { return schedule.schedule[day] ?? []; }

export function useTeacherScheduleQuery(accountId: string, teacherId: number | null, apiClient: ApiClient | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.schoolAdminTeacherSchedule(accountId, teacherId ?? 0),
    enabled: Boolean(accountId && teacherId && apiClient && enabled),
    queryFn: () => apiClient!.get<AdminTeacherSchedule>(teacherSchedulePath(teacherId!)),
    retry: shouldRetryTeacherSchedule,
  });
}
