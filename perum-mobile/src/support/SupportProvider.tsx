import NetInfo from '@react-native-community/netinfo';
import { ApiClientError } from '@perum/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { supportInvalidationKeys } from '../query/queryKeys';
import { createSupportOutboxCore, type SupportSendResult } from './outboxCore';
import { sqliteSupportOutbox } from './sqliteOutbox';
import { supportMessageCreatePayload, supportReadPayload, supportTicketCreatePayload, type SupportCategory, type SupportMessage, type SupportMutation, type SupportReadMutation, type SupportTicketCreateMutation, type SupportTicketCreateOut } from './types';
import { useCapabilities } from '../auth/CapabilityProvider';
import { createSupportReadCursorOutboxCore, type SupportReadResult } from './readCursorOutboxCore';
import { sqliteSupportReadCursorOutbox } from './sqliteReadCursorOutbox';
import { createSupportTicketCreationOutboxCore, type SupportTicketCreateResult } from './ticketCreationOutboxCore';
import { sqliteSupportTicketCreationOutbox } from './sqliteTicketCreationOutbox';

type Core = ReturnType<typeof createSupportOutboxCore>;
type ReadCore = ReturnType<typeof createSupportReadCursorOutboxCore>;
type CreationCore = ReturnType<typeof createSupportTicketCreationOutboxCore>;
type Value = { pending: SupportMutation[]; pendingTickets: SupportTicketCreateMutation[]; createTicket: (category: SupportCategory, subject: string, body: string) => Promise<SupportTicketCreateMutation | null>; retryTicket: (id: string) => Promise<void>; dismissTicket: (id: string) => Promise<void>; enqueue: (ticketId: string, body: string) => Promise<void>; markRead: (ticketId: string, messageId: string) => Promise<void>; retry: (id: string) => Promise<void> };
const Context = createContext<Value | null>(null);

export function SupportProvider({ children }: PropsWithChildren) {
  const { account, apiClient } = useAuth();
  const { hasAll } = useCapabilities();
  const enabled = hasAll(['support_requester', 'offline_support_messages']);
  const readEnabled = hasAll(['support_requester', 'offline_read_cursors']);
  const creationEnabled = hasAll(['support_requester', 'offline_support_ticket_creation']);
  const queryClient = useQueryClient();
  const coreRef = useRef<Core | null>(null);
  const readCoreRef = useRef<ReadCore | null>(null);
  const creationCoreRef = useRef<CreationCore | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const readEnabledRef = useRef(readEnabled);
  readEnabledRef.current = readEnabled;
  const creationEnabledRef = useRef(creationEnabled);
  creationEnabledRef.current = creationEnabled;
  const [pending, setPending] = useState<SupportMutation[]>([]);
  const [pendingTickets, setPendingTickets] = useState<SupportTicketCreateMutation[]>([]);

  useEffect(() => {
    if (!account || !apiClient) { coreRef.current = null; setPending([]); return; }
    if (!enabled) { coreRef.current = null; void sqliteSupportOutbox.getByAccount(account.id).then(setPending); return; }
    let alive = true;
    const accountId = account.id;
    const refresh = async () => { const rows = await sqliteSupportOutbox.getByAccount(accountId); if (alive) setPending(rows); };
    const send = async (item: SupportMutation): Promise<SupportSendResult> => {
      try {
        return { type: 'success', message: await apiClient.post<SupportMessage>(`/support/tickets/${item.ticketId}/messages`, supportMessageCreatePayload(item)) };
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
        for (const queryKey of supportInvalidationKeys.replySent(accountId, ticketId)) void queryClient.invalidateQueries({ queryKey });
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
    const send = async (item: SupportReadMutation): Promise<SupportReadResult> => {
      try {
        await apiClient.post(`/support/tickets/${item.ticketId}/read`, supportReadPayload(item));
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
        for (const queryKey of supportInvalidationKeys.ticketRead(accountId)) void queryClient.invalidateQueries({ queryKey });
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

  useEffect(() => {
    if (!account || !apiClient) { creationCoreRef.current = null; setPendingTickets([]); return; }
    const accountId = account.id;
    let alive = true;
    const refresh = async () => { const rows = await sqliteSupportTicketCreationOutbox.getByAccount(accountId); if (alive) setPendingTickets(rows); };
    if (!creationEnabled) { creationCoreRef.current = null; void refresh(); return () => { alive = false; }; }
    const send = async (item: SupportTicketCreateMutation): Promise<SupportTicketCreateResult> => {
      try {
        return { type: 'success', result: await apiClient.post<SupportTicketCreateOut>('/support/tickets', supportTicketCreatePayload(item)) };
      } catch (error) {
        if (!(error instanceof ApiClientError)) return { type: 'transport', message: error instanceof Error ? error.message : undefined };
        return { type: 'http', status: error.status, message: error.message };
      }
    };
    const core = createSupportTicketCreationOutboxCore({
      store: sqliteSupportTicketCreationOutbox,
      send,
      canSend: () => creationEnabledRef.current,
      onChange: refresh,
      onSuccess: () => { for (const queryKey of supportInvalidationKeys.ticketCreated(accountId)) void queryClient.invalidateQueries({ queryKey }); },
    });
    creationCoreRef.current = core;
    const run = async () => { await core.run(accountId); await refresh(); };
    void core.recover().then(run);
    void refresh();
    const network = NetInfo.addEventListener((state) => { if (state.isConnected !== false) void run(); });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void run(); });
    const timer = setInterval(() => void run(), 5_000);
    return () => { alive = false; creationCoreRef.current = null; network(); appState.remove(); clearInterval(timer); };
  }, [account?.id, apiClient, creationEnabled, queryClient]);

  if (!account) return children;
  return <Context.Provider value={{ pending, pendingTickets, createTicket: async (category, subject, body) => { const core = creationCoreRef.current; if (!core) return null; const row = await core.enqueue(account.id, category, subject, body); void core.run(account.id); return row; }, retryTicket: async (id) => { await creationCoreRef.current?.retry(account.id, id); }, dismissTicket: async (id) => { await sqliteSupportTicketCreationOutbox.remove(account.id, id); setPendingTickets(await sqliteSupportTicketCreationOutbox.getByAccount(account.id)); }, enqueue: async (ticketId, body) => { const core = coreRef.current; if (!core) return; await core.enqueue(account.id, ticketId, body); void core.run(account.id); }, markRead: async (ticketId, messageId) => { const core = readCoreRef.current; if (!core) return; await core.enqueue(account.id, ticketId, messageId); void core.run(account.id); }, retry: async (id) => { await coreRef.current?.retry(account.id, id); } }}>{children}</Context.Provider>;
}

export function useSupportSync() {
  const value = useContext(Context);
  if (!value) throw new Error('SupportProvider is missing');
  return value;
}
