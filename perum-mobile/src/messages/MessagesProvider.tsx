import NetInfo from '@react-native-community/netinfo';
import { ApiClientError } from '@perum/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { socialInvalidationKeys } from '../query/queryKeys';
import { createMessageOutboxCore, type SendResult } from './outboxCore';
import { sqliteMessageOutbox } from './sqliteOutbox';
import type { Message, MessageMutation, SocialReadMutation } from './types';
import { useCapabilities } from '../auth/CapabilityProvider';
import { createSocialReadCursorOutboxCore, type SocialReadResult } from './readCursorOutboxCore';
import { sqliteSocialReadCursorOutbox } from './sqliteReadCursorOutbox';

type Core = ReturnType<typeof createMessageOutboxCore>;
type ReadCore = ReturnType<typeof createSocialReadCursorOutboxCore>;
type Value = { pending: MessageMutation[]; enqueue: (conversationId: number, body: string) => Promise<void>; retry: (id: string) => Promise<void>; markRead: (conversationId: number, messageId: number) => Promise<void> };
const Context = createContext<Value | null>(null);

export function MessagesProvider({ children }: PropsWithChildren) {
  const { account, apiClient } = useAuth();
  const { hasAll } = useCapabilities();
  const enabled = hasAll(['social_messages', 'offline_social_messages']);
  const readEnabled = hasAll(['social_messages', 'offline_social_read_cursors']);
  const queryClient = useQueryClient();
  const coreRef = useRef<Core | null>(null);
  const readCoreRef = useRef<ReadCore | null>(null);
  const enabledRef = useRef(enabled);
  const readEnabledRef = useRef(readEnabled);
  const accountIdRef = useRef(account?.id);
  enabledRef.current = enabled;
  readEnabledRef.current = readEnabled;
  accountIdRef.current = account?.id;
  const [pending, setPending] = useState<MessageMutation[]>([]);

  useEffect(() => {
    if (!account || !apiClient) { coreRef.current = null; setPending([]); return; }
    if (!enabled) { coreRef.current = null; void sqliteMessageOutbox.getByAccount(account.id).then(setPending); return; }
    let alive = true;
    const accountId = account.id;
    const canSend = () => alive && enabledRef.current && accountIdRef.current === accountId;
    const refresh = async () => { const rows = await sqliteMessageOutbox.getByAccount(accountId); if (alive) setPending(rows); };
    const send = async (item: MessageMutation): Promise<SendResult> => {
      if (!canSend()) return { type: 'transport' };
      try {
        const message = await apiClient.post<Message>(`/social/conversations/${item.conversationId}/messages`, { client_message_id: item.clientMessageId, body: item.body });
        return { type: 'success', message };
      } catch (error) {
        if (!(error instanceof ApiClientError)) return { type: 'transport', message: error instanceof Error ? error.message : undefined };
        return { type: 'http', status: error.status, message: error.message };
      }
    };
    const core = createMessageOutboxCore({
      store: sqliteMessageOutbox,
      send,
      canSend,
      onChange: refresh,
      onSuccess: () => {
        for (const queryKey of socialInvalidationKeys.messageSent(accountId)) void queryClient.invalidateQueries({ queryKey });
      },
    });
    coreRef.current = core;
    const run = async () => { await core.run(accountId); await refresh(); };
    void core.recover().then(run);
    void refresh();
    const network = NetInfo.addEventListener((state) => { if (state.isConnected !== false) void run(); });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void run(); });
    const timer = setInterval(() => void run(), 5_000);
    return () => { alive = false; coreRef.current = null; network(); appState.remove(); clearInterval(timer); };
  }, [account?.id, apiClient, enabled, queryClient]);

  useEffect(() => {
    if (!account || !apiClient || !readEnabled) { readCoreRef.current = null; return; }
    const accountId = account.id;
    let alive = true;
    const canSend = () => alive && readEnabledRef.current && accountIdRef.current === accountId;
    const core = createSocialReadCursorOutboxCore({
      store: sqliteSocialReadCursorOutbox,
      canSend,
      send: async (item: SocialReadMutation): Promise<SocialReadResult> => {
        if (!canSend()) return { type: 'transport' };
        try {
          await apiClient.post(`/social/conversations/${item.conversationId}/read`, { message_id: item.messageId, client_action_id: item.clientActionId });
          return { type: 'success' };
        } catch (error) {
          if (!(error instanceof ApiClientError)) return { type: 'transport', message: error instanceof Error ? error.message : undefined };
          return { type: 'http', status: error.status, message: error.message };
        }
      },
      onSuccess: (_, conversationId) => {
        for (const queryKey of socialInvalidationKeys.conversationRead(accountId, conversationId)) void queryClient.invalidateQueries({ queryKey });
      },
    });
    readCoreRef.current = core;
    const run = () => core.run(accountId);
    void core.recover().then(run);
    const network = NetInfo.addEventListener((state) => { if (state.isConnected !== false) void run(); });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void run(); });
    const timer = setInterval(() => void run(), 5_000);
    return () => { alive = false; if (readCoreRef.current === core) readCoreRef.current = null; network(); appState.remove(); clearInterval(timer); };
  }, [account?.id, apiClient, readEnabled, queryClient]);

  if (!account) return children;
  const value: Value = {
    pending,
    enqueue: async (conversationId, body) => { const core = coreRef.current; if (!core) return; await core.enqueue(account.id, conversationId, body); void core.run(account.id); },
    retry: async (id) => { await coreRef.current?.retry(account.id, id); },
    markRead: async (conversationId, messageId) => { const core = readCoreRef.current; if (!core) return; await core.enqueue(account.id, conversationId, messageId); void core.run(account.id); },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMessagesSync() {
  const value = useContext(Context);
  if (!value) throw new Error('MessagesProvider is missing');
  return value;
}
