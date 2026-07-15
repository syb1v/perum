import type { components } from '@perum/api-schema/tenant';

export type SupportTicket = components['schemas']['TicketOut'];
export type SupportTicketPage = components['schemas']['TicketPage'];
export type SupportTicketCreate = components['schemas']['TicketCreate'];
export type SupportTicketCreateOut = components['schemas']['TicketCreateOut'];
export type SupportMessage = components['schemas']['app__modules__support__schemas__MessageOut'];
export type SupportMessagePage = components['schemas']['app__modules__support__schemas__MessagePage'];
export type SupportUnread = components['schemas']['UnreadOut'];
export type SupportCategory = SupportTicketCreate['category'];
