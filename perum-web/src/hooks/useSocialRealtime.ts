'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/apiClient';
import type { RealtimeTicket } from '@/types/messages';

export type SocialRealtimeState = 'connected' | 'reconnecting' | 'polling';

type SocialRealtimeEvent =
    | { v: 1; type: 'connected'; data: Record<string, never> }
    | { v: 1; type: 'message.created'; data: { conversation_id: number; message_id: number; sender_id: number } }
    | { v: 1; type: 'conversation.read'; data: { conversation_id: number; message_id: number; user_id: number } }
    | { v: 1; type: 'conversation.changed'; data: { conversation_id: number; reason: string } };

type Options = {
    enabled: boolean;
    conversationId?: number;
    onReconcile: () => void;
    onListChange?: () => void;
    onThreadChange?: () => void;
    onUnreadChange?: () => void;
};

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export function parseSocialRealtimeEvent(raw: unknown): SocialRealtimeEvent | null {
    if (typeof raw !== 'string') return null;
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return null; }
    if (!object(value) || value.v !== 1 || typeof value.type !== 'string' || !object(value.data)) return null;
    const data = value.data;
    if (value.type === 'connected') return Object.keys(data).length === 0 ? { v: 1, type: 'connected', data: {} } : null;
    if (!number(data.conversation_id)) return null;
    if (value.type === 'message.created' && number(data.message_id) && number(data.sender_id)) return { v: 1, type: value.type, data: { conversation_id: data.conversation_id, message_id: data.message_id, sender_id: data.sender_id } };
    if (value.type === 'conversation.read' && number(data.message_id) && number(data.user_id)) return { v: 1, type: value.type, data: { conversation_id: data.conversation_id, message_id: data.message_id, user_id: data.user_id } };
    if (value.type === 'conversation.changed' && typeof data.reason === 'string') return { v: 1, type: value.type, data: { conversation_id: data.conversation_id, reason: data.reason } };
    return null;
}

export function socialRealtimeBackoff(attempt: number, random = Math.random()): number {
    return Math.min(30000, Math.max(1000, 1000 * 2 ** Math.min(attempt, 5)) * (1 + Math.min(1, Math.max(0, random)) * .25));
}

function websocketUrl(path: string, ticket: string): string | null {
    try {
        const apiOrigin = new URL('/api', window.location.origin).origin;
        const url = new URL(path, apiOrigin);
        if (url.origin !== apiOrigin || (url.protocol !== 'http:' && url.protocol !== 'https:')) return null;
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.search = '';
        url.hash = '';
        url.searchParams.set('ticket', ticket);
        return url.toString();
    } catch {
        return null;
    }
}

export function useSocialRealtime(options: Options): SocialRealtimeState {
    const [state, setState] = useState<SocialRealtimeState>('polling');
    const callbacks = useRef(options);
    callbacks.current = options;

    useEffect(() => {
        if (!options.enabled) { setState('polling'); return; }
        let active = true;
        let generation = 0;
        let attempt = 0;
        let socket: WebSocket | null = null;
        let reconnectTimer: number | null = null;
        let heartbeatTimer: number | null = null;

        const clearSocket = () => {
            if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
            heartbeatTimer = null;
            if (socket) {
                socket.onopen = null;
                socket.onmessage = null;
                socket.onerror = null;
                socket.onclose = null;
                socket.close();
            }
            socket = null;
        };

        const connect = async () => {
            const currentGeneration = ++generation;
            clearSocket();
            if (!active) return;
            setState('reconnecting');
            try {
                const issued = await api.post<RealtimeTicket>('/social/realtime-ticket');
                if (!active || currentGeneration !== generation) return;
                const url = websocketUrl(issued.websocket_path, issued.ticket);
                if (!url) throw new Error();
                const nextSocket = new WebSocket(url);
                socket = nextSocket;
                nextSocket.onopen = () => {
                    if (!active || currentGeneration !== generation) return;
                    heartbeatTimer = window.setInterval(() => {
                        if (nextSocket.readyState === WebSocket.OPEN) nextSocket.send(JSON.stringify({ type: 'pong' }));
                    }, 30000);
                };
                nextSocket.onmessage = event => {
                    if (!active || currentGeneration !== generation) return;
                    const payload = parseSocialRealtimeEvent(event.data);
                    if (!payload) return;
                    if (payload.type === 'connected') {
                        attempt = 0;
                        setState('connected');
                        callbacks.current.onReconcile();
                        callbacks.current.onUnreadChange?.();
                        return;
                    }
                    callbacks.current.onListChange?.();
                    callbacks.current.onUnreadChange?.();
                    if (callbacks.current.conversationId === payload.data.conversation_id) callbacks.current.onThreadChange?.();
                };
                nextSocket.onerror = () => nextSocket.close();
                nextSocket.onclose = () => {
                    if (!active || currentGeneration !== generation) return;
                    clearSocket();
                    setState('polling');
                    reconnectTimer = window.setTimeout(() => { attempt += 1; void connect(); }, socialRealtimeBackoff(attempt));
                };
            } catch {
                if (!active || currentGeneration !== generation) return;
                setState('polling');
                reconnectTimer = window.setTimeout(() => { attempt += 1; void connect(); }, socialRealtimeBackoff(attempt));
            }
        };

        const visibility = () => {
            if (document.visibilityState !== 'visible') return;
            callbacks.current.onReconcile();
            callbacks.current.onUnreadChange?.();
            if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
                if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
                reconnectTimer = null;
                attempt = 0;
                void connect();
            }
        };

        void connect();
        document.addEventListener('visibilitychange', visibility);
        return () => {
            active = false;
            generation += 1;
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            document.removeEventListener('visibilitychange', visibility);
            clearSocket();
        };
    }, [options.enabled]);

    return state;
}
