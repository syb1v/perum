import type { components } from '@perum/api-schema/tenant';
import { isSchoolSupportOperator } from '@perum/domain';

export type NotificationItem = components['schemas']['NotificationOut'];
export type NotificationList = components['schemas']['NotificationListOut'];

export function notificationTarget(role: string | undefined, enabled: boolean, item: NotificationItem) {
  if (!enabled || !isSchoolSupportOperator(role)) return null;
  if (item.ref_type !== 'admin_support_ticket' || !item.ref_id) return null;
  return { pathname: '/admin-support/[ticketId]' as const, params: { ticketId: item.ref_id } };
}
