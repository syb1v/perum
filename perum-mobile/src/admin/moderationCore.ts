import type { components } from '@perum/api-schema/tenant';
import { queryKeys } from '../query/queryKeys';

export type ModerationCasePage = components['schemas']['ModerationCasePageOut'];
export type ModerationCaseSummary = components['schemas']['ModerationCaseSummaryOut'];
export type ModerationCaseDetail = components['schemas']['ModerationCaseDetailOut'];
export type ModerationAction = components['schemas']['ModerationActionCreate']['action'];
export type ModerationActionPayload = components['schemas']['ModerationActionCreate'];

export const MODERATION_PAGE_SIZE = 20;
export const MODERATION_REASON_MAX_LENGTH = 1000;
export const MODERATION_ACTIONS = ['dismiss', 'hide_reported_message', 'lock_conversation', 'unlock_conversation'] as const satisfies readonly ModerationAction[];

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

export function moderationActionPath(caseId: number) {
  const path = moderationCasePath(caseId);
  return path ? `${path}/actions` : null;
}

export function moderationReasonError(reason: string) {
  const length = reason.trim().length;
  if (!length) return 'Укажите причину действия.';
  if (length > MODERATION_REASON_MAX_LENGTH) return `Причина не должна превышать ${MODERATION_REASON_MAX_LENGTH} символов.`;
  return null;
}

export function createModerationActionAttempt(action: ModerationAction, reason: string, expectedVersion: number, createId: () => string = () => crypto.randomUUID()) {
  const clientActionId = createId();
  const payload: ModerationActionPayload = { action, reason: reason.trim(), client_action_id: clientActionId, expected_version: expectedVersion };
  return { clientActionId, payload };
}

export function matchesModerationActionAttempt(attempt: ReturnType<typeof createModerationActionAttempt>, action: ModerationAction, reason: string) {
  return attempt.payload.action === action && attempt.payload.reason === reason.trim();
}

export function isModerationConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { status?: unknown }).status === 409);
}

export function moderationInvalidationTargets(accountId: string, caseId: number) {
  return [queryKeys.schoolAdminModeration(accountId), queryKeys.schoolAdminModerationCase(accountId, caseId)] as const;
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
