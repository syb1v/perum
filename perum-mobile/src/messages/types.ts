import type { components } from '@perum/api-schema/tenant';

export type Conversation = components['schemas']['ConversationOut'];
export type ConversationPage = components['schemas']['ConversationPage'];
export type Message = components['schemas']['app__modules__social__schemas__MessageOut'];
export type MessagePage = components['schemas']['app__modules__social__schemas__MessagePage'];
export type ReportCreate = components['schemas']['ReportCreate'];
export type ReportOut = components['schemas']['ReportOut'];

export type MessageMutationState = 'pending' | 'sending' | 'retry_wait' | 'failed_permanent';

export type MessageMutation = {
  id: string;
  accountId: string;
  conversationId: number;
  clientMessageId: string;
  body: string;
  state: MessageMutationState;
  attempts: number;
  nextAttemptAt: number;
  error: string | null;
  createdAt: number;
};

export type DisplayMessage = Message & { delivery?: 'pending' | 'failed' };

export type SocialReadMutation = {
  id: string;
  accountId: string;
  conversationId: number;
  messageId: number;
  clientActionId: string;
  state: MessageMutationState;
  attempts: number;
  nextAttemptAt: number;
  error: string | null;
  createdAt: number;
};
