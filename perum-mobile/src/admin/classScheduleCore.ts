import type { ApiClient } from '@perum/api-client';
import { ApiClientError } from '@perum/api-client';
import type { components } from '@perum/api-schema/tenant';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query/queryKeys';

export type AdminClassSchedule = components['schemas']['AdminClassScheduleReadOut'];
export type AdminClassScheduleLesson = components['schemas']['AdminClassScheduleReadLessonOut'];

export const classScheduleDays = [
  { key: '0', name: 'Понедельник' },
  { key: '1', name: 'Вторник' },
  { key: '2', name: 'Среда' },
  { key: '3', name: 'Четверг' },
  { key: '4', name: 'Пятница' },
  { key: '5', name: 'Суббота' },
] as const;

export function normalizeClassId(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function classSchedulePath(classId: number) { return `/admin/classes/${classId}/schedule/read`; }
function errorDetail(error: ApiClientError) {
  const data = error.originalErrorData;
  if (!data || typeof data !== 'object' || Array.isArray(data) || !('detail' in data)) return null;
  return (data as { detail?: unknown }).detail;
}

export function isClassScheduleUnavailable(error: unknown) { return error instanceof ApiClientError && error.status === 404 && errorDetail(error) === 'Not Found'; }
export function isClassNotFound(error: unknown) { return error instanceof ApiClientError && error.status === 404 && errorDetail(error) === 'Класс не найден'; }
export function shouldRetryClassSchedule(failureCount: number, error: unknown) {
  if (failureCount >= 3) return false;
  if (!(error instanceof ApiClientError)) return true;
  return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}
export function normalizeClassScheduleDay(rows: readonly AdminClassScheduleLesson[] | unknown): AdminClassScheduleLesson[] {
  if (!Array.isArray(rows)) return [];
  const lessons = new Map<number, AdminClassScheduleLesson>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const lesson = row as Record<string, unknown>;
    if (!Number.isInteger(lesson.lesson_number) || (lesson.lesson_number as number) < 1 || (lesson.lesson_number as number) > 8) continue;
    if (![lesson.subject_display, lesson.teacher_display, lesson.room].every(value => value === null || typeof value === 'string')) continue;
    const lessonNumber = lesson.lesson_number as number;
    if (!lessons.has(lessonNumber)) lessons.set(lessonNumber, {
      lesson_number: lessonNumber,
      subject_display: lesson.subject_display as string | null,
      teacher_display: lesson.teacher_display as string | null,
      room: lesson.room as string | null,
    });
  }
  return [...lessons.values()].sort((left, right) => left.lesson_number - right.lesson_number);
}
export function classScheduleLessons(schedule: AdminClassSchedule, day: typeof classScheduleDays[number]['key']) { return normalizeClassScheduleDay(schedule.schedule?.[day]); }

export function useClassScheduleQuery(accountId: string, classId: number | null, apiClient: ApiClient | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.schoolAdminClassSchedule(accountId, classId ?? 0),
    enabled: Boolean(accountId && classId && apiClient && enabled),
    queryFn: () => apiClient!.get<AdminClassSchedule>(classSchedulePath(classId!)),
    retry: shouldRetryClassSchedule,
  });
}
