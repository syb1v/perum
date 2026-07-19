import type { components } from '@perum/api-schema/tenant';

export type SupportTicket = components['schemas']['TicketOut'];
export type SupportTicketPage = components['schemas']['TicketPage'];
export type SupportTicketCreate = components['schemas']['TicketCreate'];
export type SupportTicketCreateOut = components['schemas']['TicketCreateOut'];
export type SupportMessage = components['schemas']['app__modules__support__schemas__MessageOut'];
export type SupportMessagePage = components['schemas']['app__modules__support__schemas__MessagePage'];
export type SupportCategory = SupportTicketCreate['category'];
export type AdminSupportUnread = components['schemas']['AdminUnreadOut'];

export type SupportMutationState = 'pending' | 'sending' | 'retry_wait' | 'failed_permanent';

export type SupportMutation = {
  id: string;
  accountId: string;
  ticketId: string;
  clientMessageId: string;
  body: string;
  state: SupportMutationState;
  attempts: number;
  nextAttemptAt: number;
  error: string | null;
  createdAt: number;
};

export type SupportReadMutation = {
  id: string;
  accountId: string;
  ticketId: string;
  messageId: string;
  clientActionId: string;
  state: SupportMutationState;
  attempts: number;
  nextAttemptAt: number;
  error: string | null;
  createdAt: number;
};

export type SupportTicketCreateMutationState = SupportMutationState | 'reconciled';

export type SupportTicketCreateMutation = {
  id: string;
  accountId: string;
  clientTicketId: string;
  clientMessageId: string;
  category: SupportCategory;
  subject: string;
  body: string;
  state: SupportTicketCreateMutationState;
  attempts: number;
  nextAttemptAt: number;
  error: string | null;
  createdAt: number;
  serverTicketId: string | null;
};
