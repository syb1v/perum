import NetInfo from '@react-native-community/netinfo';
import { ApiClientError } from '@perum/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { queryKeys } from '../query/queryKeys';
import { createSupportOutboxCore, type SupportSendResult } from './outboxCore';
import { sqliteSupportOutbox } from './sqliteOutbox';
import type { SupportMessage, SupportMutation } from './types';
import { useCapabilities } from '../auth/CapabilityProvider';
import { createSupportReadCursorOutboxCore, type SupportReadResult } from './readCursorOutboxCore';
import { sqliteSupportReadCursorOutbox } from './sqliteReadCursorOutbox';

type Core = ReturnType<typeof createSupportOutboxCore>;
type ReadCore = ReturnType<typeof createSupportReadCursorOutboxCore>;
type Value = { pending: SupportMutation[]; enqueue: (ticketId: string, body: string) => Promise<void>; markRead: (ticketId: string, messageId: string) => Promise<void>; retry: (id: string) => Promise<void> };
const Context = createContext<Value | null>(null);

export function SupportProvider({ children }: PropsWithChildren) {
  const { account, apiClient } = useAuth();
  const { hasAll } = useCapabilities();
  const enabled = hasAll(['support_requester', 'offline_support_messages']);
  const readEnabled = hasAll(['support_requester', 'offline_read_cursors']);
  const queryClient = useQueryClient();
  const coreRef = useRef<Core | null>(null);
  const readCoreRef = useRef<ReadCore | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const readEnabledRef = useRef(readEnabled);
  readEnabledRef.current = readEnabled;
  const [pending, setPending] = useState<SupportMutation[]>([]);

  useEffect(() => {
    if (!account || !apiClient) { coreRef.current = null; setPending([]); return; }
    if (!enabled) { coreRef.current = null; void sqliteSupportOutbox.getByAccount(account.id).then(setPending); return; }
    let alive = true;
    const accountId = account.id;
    const refresh = async () => { const rows = await sqliteSupportOutbox.getByAccount(accountId); if (alive) setPending(rows); };
    const send = async (item: SupportMutation): Promise<SupportSendResult> => {
      try {
        return { type: 'success', message: await apiClient.post<SupportMessage>(`/support/tickets/${item.ticketId}/messages`, { client_message_id: item.clientMessageId, body: item.body }) };
      } catch (error) {
        if (!(error instanceof ApiClientError)) return { type: 'transport', message: error instanceof Error ? error.message : undefined };
        return { type: 'http', status: error.status, message: error.message };
      }
    };
    const core = createSupportOutboxCore({
      store: sqliteSupportOutbox,
      send,
      canSend: () => enabledRef.current,
      onChange: refresh,
      onSuccess: (_, ticketId) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.supportTickets(accountId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.supportThread(accountId, ticketId) });
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
    const send = async (item: import('./types').SupportReadMutation): Promise<SupportReadResult> => {
      try {
        await apiClient.post(`/support/tickets/${item.ticketId}/read`, { client_action_id: item.clientActionId, message_id: item.messageId });
        return { type: 'success' };
      } catch (error) {
        if (!(error instanceof ApiClientError)) return { type: 'transport', message: error instanceof Error ? error.message : undefined };
        return { type: 'http', status: error.status, message: error.message };
      }
    };
    const core = createSupportReadCursorOutboxCore({
      store: sqliteSupportReadCursorOutbox,
      send,
      canSend: () => readEnabledRef.current,
      onSuccess: (_, ticketId) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.supportTickets(accountId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.supportTicket(accountId, ticketId) });
      },
    });
    readCoreRef.current = core;
    const run = async () => core.run(accountId);
    void core.recover().then(run);
    const network = NetInfo.addEventListener((state) => { if (state.isConnected !== false) void run(); });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void run(); });
    const timer = setInterval(() => void run(), 5_000);
    return () => { readCoreRef.current = null; network(); appState.remove(); clearInterval(timer); };
  }, [account?.id, apiClient, queryClient, readEnabled]);

  if (!account) return children;
  return <Context.Provider value={{ pending, enqueue: async (ticketId, body) => { const core = coreRef.current; if (!core) return; await core.enqueue(account.id, ticketId, body); void core.run(account.id); }, markRead: async (ticketId, messageId) => { const core = readCoreRef.current; if (!core) return; await core.enqueue(account.id, ticketId, messageId); void core.run(account.id); }, retry: async (id) => { await coreRef.current?.retry(account.id, id); } }}>{children}</Context.Provider>;
}

export function useSupportSync() {
  const value = useContext(Context);
  if (!value) throw new Error('SupportProvider is missing');
  return value;
}
