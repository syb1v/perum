import type { components } from '@perum/api-schema/tenant';

export type ModerationCasePage = components['schemas']['ModerationCasePageOut'];
export type ModerationCaseSummary = components['schemas']['ModerationCaseSummaryOut'];
export type ModerationCaseDetail = components['schemas']['ModerationCaseDetailOut'];

export const MODERATION_PAGE_SIZE = 20;

export function canViewSchoolModeration(role: string) {
  return role === 'school_admin' || role === 'director';
}

export function moderationCasesPath(cursor: number | null) {
  return `/admin/social/moderation/cases?limit=${MODERATION_PAGE_SIZE}${cursor === null ? '' : `&cursor=${cursor}`}`;
}

export function moderationCasePath(caseId: number) {
  if (!Number.isInteger(caseId) || caseId <= 0) return null;
  return `/admin/social/moderation/cases/${caseId}`;
}

export function mergeModerationCases(pages: ModerationCasePage[]) {
  const seen = new Set<number>();
  return pages.flatMap((page) => page.items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }));
}

export function formatModerationDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
