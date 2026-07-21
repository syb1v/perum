import NetInfo from '@react-native-community/netinfo';
import { ApiClientError } from '@perum/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { useCapabilities } from '../auth/CapabilityProvider';
import { queryKeys } from '../query/queryKeys';
import { adminTicketActionPath, adminTicketActionPayload, canUseAdminSupport, type AdminTicketAction } from './adminCore';
import { createAdminActionOutbox, type AdminActionMutation, type AdminActionResult } from './adminActionOutboxCore';
import { sqliteAdminActionOutbox } from './sqliteAdminActionOutbox';
import type { SupportTicket } from './types';

type Core = ReturnType<typeof createAdminActionOutbox>;
const Context = createContext<{ pending: AdminActionMutation[]; enqueue(ticketId: string, expectedVersion: number, action: AdminTicketAction): Promise<void>; discard(id: string): Promise<void> } | null>(null);
export function AdminActionProvider({ children }: PropsWithChildren) {
  const { account, apiClient } = useAuth(); const { has } = useCapabilities(); const enabled = canUseAdminSupport(account?.user.role, has('support_admin')); const enabledRef = useRef(enabled); enabledRef.current = enabled; const queryClient = useQueryClient(); const coreRef = useRef<Core | null>(null); const [pending, setPending] = useState<AdminActionMutation[]>([]);
  useEffect(() => {
    if (!account || !apiClient || !enabled) { coreRef.current = null; setPending([]); return; }
    let alive = true; const accountId = account.id; const refresh = async () => { const rows = await sqliteAdminActionOutbox.getByAccount(accountId); if (alive) setPending(rows); };
    const core = createAdminActionOutbox({ store: sqliteAdminActionOutbox, canSend: () => enabledRef.current, send: async item => { try { const payload = adminTicketActionPayload(item.action, item.expectedVersion, item.id); const ticket = item.action.kind === 'assignment' ? await apiClient.post<SupportTicket>(adminTicketActionPath(item.ticketId, item.action), payload) : await apiClient.patch<SupportTicket>(adminTicketActionPath(item.ticketId, item.action), payload); return { type: 'success', ticket } as AdminActionResult; } catch (error) { if (!(error instanceof ApiClientError)) return { type: 'transport', message: error instanceof Error ? error.message : undefined }; const detail = (error.originalErrorData as { detail?: { code?: unknown } })?.detail; return { type: 'http', status: error.status, code: typeof detail?.code === 'string' ? detail.code : undefined, message: error.message }; } }, onChange: refresh, onSuccess: async (_, ticket) => { queryClient.setQueryData(queryKeys.adminSupportTicket(accountId, ticket.id), ticket); await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportTickets(accountId) }), queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportUnread(accountId) })]); }, onConflict: async (_, ticketId) => { await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportTicket(accountId, ticketId) }), queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportTickets(accountId) }), queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportUnread(accountId) })]); } });
    coreRef.current = core; const run = async () => { await core.run(accountId); await refresh(); }; void core.recover().then(run); void refresh(); const network = NetInfo.addEventListener(state => { if (state.isConnected !== false) void run(); }); const app = AppState.addEventListener('change', state => { if (state === 'active') void run(); }); const timer = setInterval(() => void run(), 5000); return () => { alive = false; network(); app.remove(); clearInterval(timer); };
  }, [account?.id, apiClient, enabled, queryClient]);
  if (!account) return children; return <Context.Provider value={{ pending, enqueue: async (ticketId, version, action) => { await coreRef.current?.enqueue(account.id, ticketId, version, action); void coreRef.current?.run(account.id); }, discard: async id => { await coreRef.current?.discard(account.id, id); } }}>{children}</Context.Provider>;
}
export function useAdminActionSync() { const value = useContext(Context); if (!value) throw new Error('AdminActionProvider is missing'); return value; }
