import type { AdminSupportAssign, AdminSupportEscalate, AdminSupportTicketPatch, SupportMessage } from './types';

import { isSchoolSupportOperator } from '@perum/domain';

export function canUseAdminSupport(role: string | undefined, enabled: boolean) {
  return enabled && isSchoolSupportOperator(role);
}

export function adminMessageLabel(side: SupportMessage['side']) {
  if (side === 'requester') return 'Пользователь';
  if (side === 'admin_inbox') return 'Организация';
  return 'Школа';
}

export function canQueueAdminReply(status: string, enabled: boolean) {
  return enabled && status !== 'closed';
}

export type AdminTicketAction =
  | { kind: 'metadata'; field: 'status'; value: NonNullable<AdminSupportTicketPatch['status']> }
  | { kind: 'metadata'; field: 'category'; value: NonNullable<AdminSupportTicketPatch['category']> }
  | { kind: 'metadata'; field: 'priority'; value: NonNullable<AdminSupportTicketPatch['priority']> }
  | { kind: 'assignment'; assigneeId: number | null }
  | { kind: 'escalation'; redactedSummary: string };

export function adminTicketActionPath(ticketId: string, action: AdminTicketAction) {
  if (action.kind === 'assignment') return `/admin/support/tickets/${ticketId}/assign`;
  return action.kind === 'escalation' ? `/admin/support/tickets/${ticketId}/escalate` : `/admin/support/tickets/${ticketId}`;
}

export function adminTicketReplyPath(ticketId: string) {
  return `/admin/support/tickets/${ticketId}/messages`;
}

export function adminTicketReadPath(ticketId: string) {
  return `/admin/support/tickets/${ticketId}/read`;
}

export function adminTicketActionPayload(action: AdminTicketAction, expectedVersion: number, clientActionId: string): AdminSupportTicketPatch | AdminSupportAssign | AdminSupportEscalate {
  if (action.kind === 'assignment') return { client_action_id: clientActionId, expected_version: expectedVersion, assignee_id: action.assigneeId };
  if (action.kind === 'escalation') return { client_action_id: clientActionId, expected_version: expectedVersion, redacted_summary: action.redactedSummary };
  if (action.field === 'status') return { client_action_id: clientActionId, expected_version: expectedVersion, status: action.value };
  if (action.field === 'category') return { client_action_id: clientActionId, expected_version: expectedVersion, category: action.value };
  return { client_action_id: clientActionId, expected_version: expectedVersion, priority: action.value };
}

export function isVersionConflict(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; originalErrorData?: { detail?: { code?: unknown } } };
  return candidate.status === 409 && candidate.originalErrorData?.detail?.code === 'VERSION_CONFLICT';
}

export function escalationDeliveryLabel(state: 'pending' | 'retrying' | 'delivered' | 'failed') {
  if (state === 'delivered') return 'Доставлено в PERUM';
  if (state === 'failed') return 'Требуется ручной повтор';
  if (state === 'retrying') return 'Повторная отправка';
  return 'Ожидает отправки';
}
