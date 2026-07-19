import type { SupportMessage } from './types';

export function canUseAdminSupport(role: string | undefined, enabled: boolean) {
  return enabled && (role === 'school_admin' || role === 'director');
}

export function adminMessageLabel(side: SupportMessage['side']) {
  if (side === 'requester') return 'Пользователь';
  if (side === 'admin_inbox') return 'Организация';
  return 'Школа';
}

export function canReplyToAdminTicket(status: string, online: boolean) {
  return online && status !== 'closed';
}

export type AdminTicketAction =
  | { kind: 'metadata'; field: 'status' | 'category' | 'priority'; value: string }
  | { kind: 'assignment'; assigneeId: number | null };

export function adminTicketActionPath(ticketId: string, action: AdminTicketAction) {
  return action.kind === 'assignment' ? `/admin/support/tickets/${ticketId}/assign` : `/admin/support/tickets/${ticketId}`;
}

export function adminTicketActionPayload(action: AdminTicketAction, expectedVersion: number, clientActionId: string) {
  if (action.kind === 'assignment') return { client_action_id: clientActionId, expected_version: expectedVersion, assignee_id: action.assigneeId };
  return { client_action_id: clientActionId, expected_version: expectedVersion, [action.field]: action.value };
}

export function isVersionConflict(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; originalErrorData?: { detail?: { code?: unknown } } };
  return candidate.status === 409 && candidate.originalErrorData?.detail?.code === 'VERSION_CONFLICT';
}

export function escalationDeliveryLabel(state: 'pending' | 'retrying' | 'delivered') {
  if (state === 'delivered') return 'Доставлено в PERUM';
  if (state === 'retrying') return 'Повторная отправка';
  return 'Ожидает отправки';
}
