import type { components } from '@perum/api-schema/tenant';

export type Conversation = components['schemas']['ConversationOut'];
export type ConversationPage = components['schemas']['ConversationPage'];
export type Message = components['schemas']['app__modules__social__schemas__MessageOut'];
export type MessagePage = components['schemas']['app__modules__social__schemas__MessagePage'];
export type UnreadCount = components['schemas']['UnreadCountOut'];
export type RealtimeTicket = components['schemas']['RealtimeTicketOut'];
export type ReportCreate = components['schemas']['ReportCreate'];
export type ReportOut = components['schemas']['ReportOut'];
export type ModerationActionCreate = components['schemas']['ModerationActionCreate'];

export type ModerationCaseSummary = components['schemas']['ModerationCaseSummaryOut'];
export type ModerationCasePage = components['schemas']['ModerationCasePageOut'];
export type ModerationCaseDetail = components['schemas']['ModerationCaseDetailOut'];
export type ModerationActionOut = components['schemas']['ModerationActionOut'];
