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

type Core = ReturnType<typeof createHomeworkOutbox>;
const Context = createContext<{ pending: HomeworkMutation[]; enqueue(homeworkId: number, version: number, status: HomeworkStatus): Promise<void> } | null>(null);
export function HomeworkProvider({ children }: PropsWithChildren) {
  const { account, apiClient } = useAuth(); const queryClient = useQueryClient(); const coreRef = useRef<Core | null>(null); const [pending, setPending] = useState<HomeworkMutation[]>([]);
  useEffect(() => {
    if (!account || !apiClient || account.user.role !== 'student') { coreRef.current = null; setPending([]); return; }
    let alive = true; const accountId = account.id; const refresh = async () => { const rows = await sqliteHomeworkOutbox.getByAccount(accountId); if (alive) setPending(rows); };
    const core = createHomeworkOutbox({ store: sqliteHomeworkOutbox, send: async item => { try { return { type: 'success', state: await apiClient.put<HomeworkState>(`/homework/${item.homeworkId}/state`, { client_action_id: item.clientActionId, version: item.version, status: item.status }) } as HomeworkResult; } catch (error) { return error instanceof ApiClientError ? { type: 'http', status: error.status, message: error.message } : { type: 'transport', message: error instanceof Error ? error.message : undefined }; } }, onChange: refresh, onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.homework(accountId) }) });
    coreRef.current = core; const run = async () => { await core.run(accountId); await refresh(); }; void core.recover().then(run); void refresh(); const network = NetInfo.addEventListener(state => { if (state.isConnected !== false) void run(); }); const app = AppState.addEventListener('change', state => { if (state === 'active') void run(); }); const timer = setInterval(() => void run(), 5000); return () => { alive = false; network(); app.remove(); clearInterval(timer); };
  }, [account?.id, apiClient, queryClient]);
  if (!account) return children; return <Context.Provider value={{ pending, enqueue: async (homeworkId, version, status) => { if (!coreRef.current) return; await coreRef.current.enqueue(account.id, homeworkId, version, status); void coreRef.current.run(account.id); } }}>{children}</Context.Provider>;
}
export function useHomeworkSync() { const value = useContext(Context); if (!value) throw new Error('HomeworkProvider is missing'); return value; }
