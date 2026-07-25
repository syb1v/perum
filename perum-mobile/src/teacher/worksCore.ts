import type { components } from '@perum/api-schema/tenant';

export type TeacherWork = components['schemas']['TeacherWorkOut'];
export type TeacherWorksPage = components['schemas']['TeacherWorksOut'];

export const TEACHER_WORKS_PAGE_SIZE = 20;

export function teacherWorksPath(offset: number) {
  return `/teacher/works?limit=${TEACHER_WORKS_PAGE_SIZE}&offset=${offset}`;
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

export function formatTeacherWorkDate(value: string | null) {
  if (!value) return 'Дата не указана';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}.${dateOnly[2]}.${dateOnly[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('ru-RU');
}
