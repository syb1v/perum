import NetInfo from '@react-native-community/netinfo';
import { ApiClientError } from '@perum/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { queryKeys } from '../query/queryKeys';
import { createOutboxCore, type PatchResult } from './outboxCore';
import { sqliteOutbox } from './sqliteOutbox';
import type { Preferences, PreferencesMutation, PreferencesSnapshot } from './types';

type Core = ReturnType<typeof createOutboxCore>;
type Value = { mutation: PreferencesMutation | null; enqueue: (desired: boolean, etag: string) => Promise<void>; resolve: (choice: 'server' | 'local') => Promise<void> };
const Context = createContext<Value | null>(null);

export function preferencesSnapshot(data: Preferences): PreferencesSnapshot {
  return { data, etag: `"${data.version}"` };
}

export function PreferencesProvider({ children }: PropsWithChildren) {
  const { account, apiClient } = useAuth();
  const queryClient = useQueryClient();
  const coreRef = useRef<Core | null>(null);
  const [mutation, setMutation] = useState<PreferencesMutation | null>(null);

  useEffect(() => {
    if (!account || !apiClient) { coreRef.current = null; setMutation(null); return; }
    let alive = true;
    const accountId = account.id;
    const refresh = async () => { const next = await sqliteOutbox.getLatest(accountId); if (alive) setMutation(next); };
    const patch = async (item: PreferencesMutation): Promise<PatchResult> => {
      try {
        const data = await apiClient.patch<Preferences>('/user/preferences', { push_preview_enabled: item.desired }, { headers: { 'Idempotency-Key': item.idempotencyKey, 'If-Match': item.baseEtag } });
        return { type: 'success', snapshot: preferencesSnapshot(data) };
      } catch (error) {
        if (!(error instanceof ApiClientError)) return { type: 'transport', message: error instanceof Error ? error.message : undefined };
        const body = error.originalErrorData as { error?: { code?: string; message?: string; details?: { current?: Preferences; etag?: string } } } | undefined;
        const current = body?.error?.details?.current;
        return { type: 'http', status: error.status, code: body?.error?.code, message: body?.error?.message ?? error.message, current: current ? { data: current, etag: body?.error?.details?.etag ?? `"${current.version}"` } : undefined };
      }
    };
    const core = createOutboxCore({ store: sqliteOutbox, patch, onSuccess: async (_, snapshot) => { queryClient.setQueryData(queryKeys.preferences(accountId), snapshot); await refresh(); } });
    coreRef.current = core;
    const run = async () => { await core.run(accountId); await refresh(); };
    void core.recover().then(run);
    void refresh();
    const network = NetInfo.addEventListener((state) => { if (state.isConnected !== false) void run(); });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void run(); });
    return () => { alive = false; coreRef.current = null; network(); appState.remove(); };
  }, [account?.id, apiClient, queryClient]);

  if (!account) return children;
  const refresh = async () => setMutation(await sqliteOutbox.getLatest(account.id));
  const value: Value = {
    mutation,
    enqueue: async (desired, etag) => { const core = coreRef.current; if (!core) return; await core.enqueue(account.id, desired, etag); await refresh(); void core.run(account.id).then(refresh); },
    resolve: async (choice) => { const core = coreRef.current; if (!core) return; await core.resolveConflict(account.id, choice); await refresh(); if (choice === 'local') void core.run(account.id).then(refresh); },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePreferencesSync() {
  const value = useContext(Context);
  if (!value) throw new Error('PreferencesProvider is missing');
  return value;
}
