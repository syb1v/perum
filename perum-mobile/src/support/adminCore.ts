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
