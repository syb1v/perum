import { socialInvalidationKeys } from '../query/queryKeys';

export type RealtimeEvent =
  | { v: 1; type: 'connected'; occurred_at: string; data: Record<string, never> }
  | { v: 1; type: 'message.created'; occurred_at: string; data: { conversation_id: number; message_id: number; sender_id: number } }
  | { v: 1; type: 'conversation.read'; occurred_at: string; data: { conversation_id: number; user_id: number; message_id: number } }
  | { v: 1; type: 'conversation.changed'; occurred_at: string; data: { conversation_id: number; reason: string } };

export type RealtimeLifecycle = {
  accountId: string | null;
  role: string | null;
  foreground: boolean;
  online: boolean;
};

const positiveInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseRealtimeEvent(raw: unknown): RealtimeEvent | null {
  if (typeof raw !== 'string') return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!record(value) || value.v !== 1 || typeof value.occurred_at !== 'string' || !Number.isFinite(Date.parse(value.occurred_at)) || !record(value.data)) return null;
  const data = value.data;
  if (value.type === 'connected') return { v: 1, type: 'connected', occurred_at: value.occurred_at, data: {} };
  if (!positiveInteger(data.conversation_id)) return null;
  if (value.type === 'message.created' && positiveInteger(data.message_id) && positiveInteger(data.sender_id)) return { v: 1, type: value.type, occurred_at: value.occurred_at, data: { conversation_id: data.conversation_id, message_id: data.message_id, sender_id: data.sender_id } };
  if (value.type === 'conversation.read' && positiveInteger(data.user_id) && positiveInteger(data.message_id)) return { v: 1, type: value.type, occurred_at: value.occurred_at, data: { conversation_id: data.conversation_id, user_id: data.user_id, message_id: data.message_id } };
  if (value.type === 'conversation.changed' && typeof data.reason === 'string' && data.reason.length > 0) return { v: 1, type: value.type, occurred_at: value.occurred_at, data: { conversation_id: data.conversation_id, reason: data.reason } };
  return null;
}

export function reconnectDelay(attempt: number, random = Math.random) {
  const base = Math.min(15_000, 500 * 2 ** Math.max(0, Math.floor(attempt)));
  return Math.round(base * (0.5 + Math.min(1, Math.max(0, random()))));
}

export function shouldConnectRealtime(state: RealtimeLifecycle) {
  return Boolean(state.accountId && state.role === 'student' && state.foreground && state.online);
}

export function realtimeInvalidationKeys(accountId: string, event: RealtimeEvent) {
  if (event.type === 'connected') return socialInvalidationKeys.reconnect(accountId);
  if (event.type === 'message.created') return socialInvalidationKeys.messageCreated(accountId, event.data.conversation_id);
  if (event.type === 'conversation.read') return socialInvalidationKeys.conversationRead(accountId, event.data.conversation_id);
  return socialInvalidationKeys.conversationChanged(accountId, event.data.conversation_id);
}

export function realtimeUrl(apiBaseUrl: string, websocketPath: string, ticket: string) {
  const url = new URL(websocketPath, apiBaseUrl.endsWith('/') ? apiBaseUrl : `${apiBaseUrl}/`);
  url.protocol = 'wss:';
  url.searchParams.set('ticket', ticket);
  return url.toString();
}
