'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSocialRealtime } from '@/hooks/useSocialRealtime';
import api, { ApiClientError } from '@/lib/apiClient';
import type { Conversation, Message, MessagePage, ReportCreate, ReportOut } from '@/types/messages';
import styles from './page.module.css';

type LocalMessage = Message & { pending?: boolean; failed?: boolean };

function merge(messages: LocalMessage[], incoming: Message[]) {
    const values = new Map(messages.map(message => [message.client_message_id, message]));
    incoming.forEach(message => values.set(message.client_message_id, message));
    return [...values.values()].sort((a, b) => a.id - b.id);
}

function errorText(error: unknown) {
    if (error instanceof ApiClientError) {
        if (error.status === 403) return 'Отправка сообщений недоступна';
        if (error.status === 422) return 'Проверьте текст сообщения: ссылки могут быть запрещены';
    }
    return 'Не удалось отправить сообщение';
}

export default function ConversationPage() {
    const { conversationId } = useParams<{ conversationId: string }>();
    const { user } = useAuth();
    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<LocalMessage[]>([]);
    const [cursor, setCursor] = useState<number | null>(null);
    const [body, setBody] = useState('');
    const [loading, setLoading] = useState(true);
    const [moreLoading, setMoreLoading] = useState(false);
    const [error, setError] = useState('');
    const [report, setReport] = useState<{ message: Message; category: ReportCreate['category']; comment: string; clientId: string } | null>(null);
    const [reportState, setReportState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
    const bottomRef = useRef<HTMLDivElement>(null);
    const initialRef = useRef(true);

    const loadConversation = useCallback(async (quiet = false) => {
        try { setConversation(await api.get<Conversation>(`/social/conversations/${conversationId}`)); }
        catch { if (!quiet) setError('Не удалось открыть диалог'); }
    }, [conversationId]);

    const loadMessages = useCallback(async (nextCursor?: number, quiet = false) => {
        if (nextCursor !== undefined) setMoreLoading(true);
        try {
            const query = nextCursor === undefined ? '' : `?cursor=${nextCursor}`;
            const data = await api.get<MessagePage>(`/social/conversations/${conversationId}/messages${query}`);
            setMessages(current => nextCursor === undefined ? merge(current.filter(item => item.pending || item.failed), data.items) : merge(current, data.items));
            setCursor(data.next_cursor);
            if (initialRef.current) window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
            initialRef.current = false;
        } catch { if (!quiet) setError('Не удалось загрузить историю сообщений'); }
        finally { setLoading(false); setMoreLoading(false); }
    }, [conversationId]);

    const reconcile = useCallback(() => { void loadConversation(true); void loadMessages(undefined, true); }, [loadConversation, loadMessages]);
    const realtime = useSocialRealtime({ enabled: !!user, conversationId: Number(conversationId), onReconcile: reconcile, onListChange: () => void loadConversation(true), onThreadChange: () => void loadMessages(undefined, true), onUnreadChange: () => window.dispatchEvent(new Event('social_unread_change')) });

    useEffect(() => {
        void Promise.all([loadConversation(), loadMessages()]);
        const interval = window.setInterval(() => { void loadConversation(true); void loadMessages(undefined, true); }, realtime === 'connected' ? 30000 : 8000);
        const refresh = () => { if (document.visibilityState === 'visible') { void loadConversation(true); void loadMessages(undefined, true); } };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
    }, [loadConversation, loadMessages, realtime]);

    useEffect(() => {
        const latestPeer = [...messages].reverse().find(message => message.sender_id !== user?.id && !message.pending);
        if (!latestPeer || document.visibilityState !== 'visible') return;
        void api.post(`/social/conversations/${conversationId}/read`, { message_id: latestPeer.id }).then(() => setConversation(current => current ? { ...current, unread_count: 0 } : current)).catch(() => undefined);
    }, [conversationId, messages, user?.id]);

    const send = async (clientId: string, text: string) => {
        setMessages(current => current.map(message => message.client_message_id === clientId ? { ...message, pending: true, failed: false } : message));
        setError('');
        try {
            const sent = await api.post<Message>(`/social/conversations/${conversationId}/messages`, { client_message_id: clientId, body: text });
            setMessages(current => merge(current, [sent]).map(message => message.client_message_id === clientId ? sent : message));
        } catch (value) {
            setMessages(current => current.map(message => message.client_message_id === clientId ? { ...message, pending: false, failed: true } : message));
            setError(errorText(value));
        }
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const text = body.trim();
        if (!text || !user || !conversation?.can_send) return;
        const clientId = crypto.randomUUID();
        const optimistic: LocalMessage = { id: -Date.now(), sender_id: user.id, client_message_id: clientId, body: text, created_at: new Date().toISOString(), expires_at: '', pending: true };
        setMessages(current => merge(current, [optimistic]));
        setBody('');
        window.requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
        void send(clientId, text);
    };

    const submitReport = async (event: FormEvent) => {
        event.preventDefault();
        if (!report || report.message.sender_id === user?.id || report.message.body === null) return;
        setReportState('sending');
        const payload: ReportCreate = { message_id: report.message.id, category: report.category, comment: report.comment.trim() || null, client_report_id: report.clientId };
        try { await api.post<ReportOut>('/social/reports', payload); setReportState('success'); }
        catch { setReportState('error'); }
    };

    return <main className={styles.page}>
        <header className={styles.header}><Link href="/messages" aria-label="Назад к сообщениям">‹</Link>{conversation ? <><div className={styles.avatar}>{conversation.peer.avatar ? <img src={conversation.peer.avatar} alt="" /> : conversation.peer.name.slice(0, 1)}</div><div><h1>{conversation.peer.name}</h1><span>{conversation.peer.class_name}</span></div></> : <div><h1>Диалог</h1></div>}<small className={styles.realtime} data-state={realtime}>{realtime === 'connected' ? 'Онлайн' : realtime === 'reconnecting' ? 'Подключение...' : 'Опрос'}</small></header>
        {error && <div className={styles.error}>{error}</div>}
        <section className={styles.chat} aria-live="polite">
            {cursor !== null && <button className={styles.more} disabled={moreLoading} onClick={() => void loadMessages(cursor)}>{moreLoading ? 'Загрузка...' : 'Загрузить ранние сообщения'}</button>}
            {loading ? <div className={styles.state}>Загрузка истории...</div> : messages.length === 0 ? <div className={styles.state}>Сообщений пока нет. Начните разговор.</div> : messages.map(message => {
                const own = message.sender_id === user?.id;
                return <div className={`${styles.message} ${own ? styles.own : styles.peer}`} key={message.client_message_id}><div className={`${styles.bubble} ${message.body === null ? styles.tombstone : ''}`}>{message.body ?? 'Сообщение скрыто модератором'}<span>{new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at))}{message.pending ? ' · отправляется' : ''}</span></div>{message.failed && message.body !== null && <button onClick={() => void send(message.client_message_id, message.body!)}>Повторить</button>}{!own && message.body !== null && !message.pending && <button className={styles.reportButton} onClick={() => { setReport({ message, category: 'harassment', comment: '', clientId: crypto.randomUUID() }); setReportState('idle'); }}>Пожаловаться</button>}</div>;
            })}
            <div ref={bottomRef} />
        </section>
        {conversation && !conversation.can_send ? <div className={styles.readOnly}>Переписка заблокирована модератором и доступна только для чтения</div> : <form className={styles.composer} onSubmit={submit}><textarea value={body} onChange={event => setBody(event.target.value)} maxLength={4000} rows={1} placeholder="Сообщение" aria-label="Текст сообщения" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><span>{body.length}/4000</span><button disabled={!body.trim() || !conversation?.can_send} type="submit">Отправить</button></form>}
        {report && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setReport(null); }}><form className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="report-title" onSubmit={submitReport}><h2 id="report-title">Пожаловаться на сообщение</h2>{reportState === 'success' ? <><p className={styles.success}>Жалоба отправлена модераторам школы.</p><button type="button" onClick={() => setReport(null)}>Закрыть</button></> : <><label>Причина<select value={report.category} onChange={event => setReport(current => current ? { ...current, category: event.target.value as ReportCreate['category'] } : current)}><option value="harassment">Оскорбления</option><option value="bullying">Травля</option><option value="threats">Угрозы</option><option value="hate">Язык ненависти</option><option value="sexual">Неприемлемый контент</option><option value="spam">Спам</option><option value="other">Другое</option></select></label><label>Комментарий (необязательно)<textarea maxLength={1000} rows={4} value={report.comment} onChange={event => setReport(current => current ? { ...current, comment: event.target.value } : current)} /></label><p className={styles.notice}>Жалобу и содержание сообщения увидят уполномоченные модераторы школы. Отправитель сообщения не увидит, кто подал жалобу, но абсолютная анонимность не гарантируется.</p>{reportState === 'error' && <p className={styles.reportError}>Не удалось отправить жалобу. Повторная попытка не создаст дубликат.</p>}<div className={styles.modalActions}><button type="button" onClick={() => setReport(null)}>Отмена</button><button disabled={reportState === 'sending'} type="submit">{reportState === 'sending' ? 'Отправка...' : reportState === 'error' ? 'Повторить' : 'Отправить'}</button></div></>}</form></div>}
    </main>;
}
