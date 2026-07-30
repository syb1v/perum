import type { components } from '@perum/api-schema/tenant';
import { ApiClientError } from '@perum/api-client';

export type TeacherWork = components['schemas']['TeacherWorkOut'];
export type TeacherWorksPage = components['schemas']['TeacherWorksOut'];
export type TeacherWorksPicker = components['schemas']['JournalTeacherSubjectsOut'];
export type TeacherWorksClass = components['schemas']['JournalTeacherClassOut'];

export type TeacherWorksFilter = {
  classId: number | null;
  subjectId: number | null;
};

export const TEACHER_WORKS_PAGE_SIZE = 20;

export function teacherWorksPath(offset: number, filter: TeacherWorksFilter = { classId: null, subjectId: null }) {
  const params = new URLSearchParams();
  if (filter.classId !== null) params.set('class_id', String(filter.classId));
  if (filter.subjectId !== null) params.set('subject_id', String(filter.subjectId));
  params.set('limit', String(TEACHER_WORKS_PAGE_SIZE));
  params.set('offset', String(Math.max(0, Math.trunc(offset))));
  return `/teacher/works?${params.toString()}`;
}

export function sortedTeacherWorksClasses(picker: TeacherWorksPicker | undefined) {
  return [...(picker?.classes ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'ru', { numeric: true }));
}

export function normalizeTeacherWorksFilter(classes: TeacherWorksClass[], filter: TeacherWorksFilter): TeacherWorksFilter {
  const selectedClass = classes.find((item) => item.id === filter.classId);
  if (!selectedClass) return { classId: null, subjectId: null };
  return {
    classId: selectedClass.id,
    subjectId: selectedClass.subjects.some((item) => item.id === filter.subjectId) ? filter.subjectId : null,
  };
}

export function isTeacherWorksPickerUnavailable(error: unknown) {
  return error instanceof ApiClientError && error.status === 404;
}

export function shouldRetryTeacherWorksPicker(failureCount: number, error: unknown) {
  return !isTeacherWorksPickerUnavailable(error) && failureCount < 3;
}

export function nextTeacherWorksOffset(pages: TeacherWorksPage[], lastPage: TeacherWorksPage) {
  return lastPage.has_more ? pages.reduce((total, page) => total + page.works.length, 0) : undefined;
}

export function mergeTeacherWorks(pages: TeacherWorksPage[]) {
  const seen = new Set<string>();
  return pages.flatMap((page) => page.works.filter((work) => {
    if (seen.has(work.id)) return false;
    seen.add(work.id);
    return true;
  }));
}

export function selectedTeacherWork(works: TeacherWork[], selectedId: string | null) {
  return selectedId === null ? null : works.find((work) => work.id === selectedId) ?? null;
}

export function formatTeacherWorkDate(value: string | null) {
  if (!value) return 'Дата не указана';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}.${dateOnly[2]}.${dateOnly[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('ru-RU');
}
