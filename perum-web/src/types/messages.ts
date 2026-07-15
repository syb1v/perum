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

export type ModerationCaseSummary = { id: number; status: string; version: number; created_at: string; updated_at: string };
export type ModerationCasePage = { items: ModerationCaseSummary[]; next_cursor: number | null };
export type ModerationCaseDetail = ModerationCaseSummary & {
    category: string;
    comment: string | null;
    evidence: Array<{ message_id: number; sender: string; body: string | null; created_at: string }>;
    other_participant: string;
};
