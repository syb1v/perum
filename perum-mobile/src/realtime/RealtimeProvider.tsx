import NetInfo from '@react-native-community/netinfo';
import type { components as TenantComponents } from '@perum/api-schema/tenant';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { queryKeys } from '../query/queryKeys';
import { parseRealtimeEvent, realtimeInvalidationKeys, realtimeUrl, reconnectDelay, shouldConnectRealtime } from './core';

type RealtimeTicket = TenantComponents['schemas']['RealtimeTicketOut'];
type RealtimeStatus = 'connected' | 'reconnecting' | 'polling';

const Context = createContext<RealtimeStatus>('polling');

export function RealtimeProvider({ children }: PropsWithChildren) {
  const { account, apiClient } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('polling');

  useEffect(() => {
    let alive = true;
    let foreground = AppState.currentState === 'active';
    let online = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;
    let generation = 0;
    const accountId = account?.id ?? null;
    const lifecycle = () => shouldConnectRealtime({ accountId, role: account?.user.role ?? null, foreground, online });
    const invalidate = (event: NonNullable<ReturnType<typeof parseRealtimeEvent>>) => {
      if (!accountId) return;
      for (const key of realtimeInvalidationKeys(accountId, event)) void queryClient.invalidateQueries({ queryKey: key });
    };
    const clearConnection = () => {
      generation += 1;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeat) clearInterval(heartbeat);
      reconnectTimer = null;
      heartbeat = null;
      const current = socket;
      socket = null;
      current?.close();
    };
    const reconcile = () => {
      if (!accountId) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(accountId) });
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.account(accountId), 'messages'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unread(accountId) });
    };
    const schedule = () => {
      if (!alive || !lifecycle()) { setStatus('polling'); return; }
      if (attempt >= 6) { setStatus('polling'); return; }
      setStatus('reconnecting');
      const delay = reconnectDelay(attempt++);
      reconnectTimer = setTimeout(connect, delay);
    };
    const connect = async () => {
      if (!alive || !apiClient || !account || !lifecycle() || socket) return;
      const ownGeneration = generation;
      setStatus('reconnecting');
      try {
        const response = await apiClient.post<RealtimeTicket>('/social/realtime-ticket');
        if (!alive || ownGeneration !== generation || !lifecycle()) return;
        const next = new WebSocket(realtimeUrl(account.apiBaseUrl, response.websocket_path, response.ticket));
        socket = next;
        next.onopen = () => {
          if (socket !== next) return;
          attempt = 0;
          setStatus('connected');
          heartbeat = setInterval(() => { if (next.readyState === WebSocket.OPEN) next.send('{"type":"pong"}'); }, 30_000);
        };
        next.onmessage = (message) => {
          const event = parseRealtimeEvent(message.data);
          if (event) invalidate(event);
        };
        next.onerror = () => undefined;
        next.onclose = () => {
          if (socket !== next) return;
          socket = null;
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          schedule();
        };
      } catch { schedule(); }
    };
    const restart = (withReconciliation: boolean) => {
      clearConnection();
      attempt = 0;
      if (withReconciliation) reconcile();
      if (lifecycle()) void connect(); else setStatus('polling');
    };
    const appState = AppState.addEventListener('change', (next) => {
      const wasForeground = foreground;
      foreground = next === 'active';
      if (foreground && !wasForeground) restart(true);
      else if (!foreground) { clearConnection(); setStatus('polling'); }
    });
    const network = NetInfo.addEventListener((next) => {
      const wasOnline = online;
      online = next.isConnected !== false && next.isInternetReachable !== false;
      if (online && !wasOnline) restart(false);
      else if (!online) { clearConnection(); setStatus('polling'); }
    });
    if (lifecycle()) void connect();
    return () => { alive = false; clearConnection(); appState.remove(); network(); };
  }, [account?.id, apiClient, queryClient]);

  return <Context.Provider value={status}>{children}</Context.Provider>;
}

export function useRealtimeStatus() {
  return useContext(Context);
}
