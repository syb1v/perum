import NetInfo from '@react-native-community/netinfo';
import { ApiClientError } from '@perum/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { queryKeys } from '../query/queryKeys';
import { createMessageOutboxCore, type SendResult } from './outboxCore';
import { sqliteMessageOutbox } from './sqliteOutbox';
import type { Message, MessageMutation } from './types';
import { useCapabilities } from '../auth/CapabilityProvider';

type Core = ReturnType<typeof createMessageOutboxCore>;
type Value = { pending: MessageMutation[]; enqueue: (conversationId: number, body: string) => Promise<void>; retry: (id: string) => Promise<void> };
const Context = createContext<Value | null>(null);

export function MessagesProvider({ children }: PropsWithChildren) {
  const { account, apiClient } = useAuth();
  const { hasAll } = useCapabilities();
  const enabled = hasAll(['social_messages', 'offline_social_messages']);
  const queryClient = useQueryClient();
  const coreRef = useRef<Core | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [pending, setPending] = useState<MessageMutation[]>([]);

  useEffect(() => {
    if (!account || !apiClient) { coreRef.current = null; setPending([]); return; }
    if (!enabled) { coreRef.current = null; void sqliteMessageOutbox.getByAccount(account.id).then(setPending); return; }
    let alive = true;
    const accountId = account.id;
    const refresh = async () => { const rows = await sqliteMessageOutbox.getByAccount(accountId); if (alive) setPending(rows); };
    const send = async (item: MessageMutation): Promise<SendResult> => {
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
      canSend: () => enabledRef.current,
      onChange: refresh,
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(accountId) });
        void queryClient.invalidateQueries({ queryKey: [...queryKeys.account(accountId), 'messages'] });
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

  if (!account) return children;
  const value: Value = {
    pending,
    enqueue: async (conversationId, body) => { const core = coreRef.current; if (!core) return; await core.enqueue(account.id, conversationId, body); void core.run(account.id); },
    retry: async (id) => { await coreRef.current?.retry(account.id, id); },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMessagesSync() {
  const value = useContext(Context);
  if (!value) throw new Error('MessagesProvider is missing');
  return value;
}
