import NetInfo from '@react-native-community/netinfo';
import { ApiClientError } from '@perum/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { queryKeys } from '../query/queryKeys';
import { createHomeworkOutbox, type HomeworkResult } from './outboxCore';
import { sqliteHomeworkOutbox } from './sqliteOutbox';
import type { HomeworkMutation, HomeworkState, HomeworkStatus } from './types';
import { useCapabilities } from '../auth/CapabilityProvider';

type Core = ReturnType<typeof createHomeworkOutbox>;
const Context = createContext<{ pending: HomeworkMutation[]; enqueue(homeworkId: number, version: number, status: HomeworkStatus): Promise<void>; resolve(id: string, choice: 'server' | 'local'): Promise<void> } | null>(null);
export function HomeworkProvider({ children }: PropsWithChildren) {
  const { account, apiClient } = useAuth(); const { has } = useCapabilities(); const enabled = has('offline_homework_state'); const enabledRef = useRef(enabled); enabledRef.current = enabled; const queryClient = useQueryClient(); const coreRef = useRef<Core | null>(null); const [pending, setPending] = useState<HomeworkMutation[]>([]);
  useEffect(() => {
    if (!account || !apiClient || account.user.role !== 'student') { coreRef.current = null; setPending([]); return; }
    if (!enabled) { coreRef.current = null; void sqliteHomeworkOutbox.getByAccount(account.id).then(setPending); return; }
    let alive = true; const accountId = account.id; const refresh = async () => { const rows = await sqliteHomeworkOutbox.getByAccount(accountId); if (alive) setPending(rows); };
    const core = createHomeworkOutbox({ store: sqliteHomeworkOutbox, canSend: () => enabledRef.current, send: async item => { try { return { type: 'success', state: await apiClient.put<HomeworkState>(`/homework/${item.homeworkId}/state`, { client_action_id: item.clientActionId, version: item.version, status: item.status }) } as HomeworkResult; } catch (error) { if (!(error instanceof ApiClientError)) return { type: 'transport', message: error instanceof Error ? error.message : undefined }; const detail = (error.originalErrorData as { detail?: { current_version?: number; current_status?: HomeworkState['status']; current_completed_at?: string | null } })?.detail; return { type: 'http', status: error.status, message: error.message, serverState: detail?.current_version !== undefined && detail.current_status ? { version: detail.current_version, status: detail.current_status, completed_at: detail.current_completed_at ?? null } : undefined }; } }, onChange: refresh, onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.homework(accountId) }) });
    coreRef.current = core; const run = async () => { await core.run(accountId); await refresh(); }; void core.recover().then(run); void refresh(); const network = NetInfo.addEventListener(state => { if (state.isConnected !== false) void run(); }); const app = AppState.addEventListener('change', state => { if (state === 'active') void run(); }); const timer = setInterval(() => void run(), 5000); return () => { alive = false; network(); app.remove(); clearInterval(timer); };
  }, [account?.id, apiClient, enabled, queryClient]);
  if (!account) return children; return <Context.Provider value={{ pending, enqueue: async (homeworkId, version, status) => { if (!coreRef.current) return; await coreRef.current.enqueue(account.id, homeworkId, version, status); void coreRef.current.run(account.id); }, resolve: async (id, choice) => { await coreRef.current?.resolve(account.id, id, choice); } }}>{children}</Context.Provider>;
}
export function useHomeworkSync() { const value = useContext(Context); if (!value) throw new Error('HomeworkProvider is missing'); return value; }
