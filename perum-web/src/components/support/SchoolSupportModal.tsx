'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import api from '@/lib/apiClient';
import type { SupportCategory, SupportMessage, SupportMessagePage, SupportTicket, SupportTicketCreateOut, SupportTicketPage } from '@/types/support';
import styles from './SchoolSupportModal.module.css';

type View = 'list' | 'create' | 'thread';
type PendingMessage = { clientId: string; body: string; state: 'sending' | 'failed' };

const categories: { value: SupportCategory; label: string }[] = [
    { value: 'general', label: 'Общий вопрос' },
    { value: 'technical', label: 'Техническая проблема' },
    { value: 'account', label: 'Учётная запись' },
    { value: 'academic', label: 'Учебный процесс' },
    { value: 'safety', label: 'Безопасность' },
    { value: 'other', label: 'Другое' },
];

const statusLabels: Record<string, string> = {
    open: 'Открыто', in_progress: 'В работе', waiting_requester: 'Ждёт вашего ответа', resolved: 'Решено', closed: 'Закрыто',
};

const makeId = () => crypto.randomUUID();
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('ru', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '';

export default function SchoolSupportModal({ onClose }: { onClose: () => void }) {
    const [view, setView] = useState<View>('list');
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [active, setActive] = useState<SupportTicket | null>(null);
    const [messages, setMessages] = useState<SupportMessage[]>([]);
    const [messageCursor, setMessageCursor] = useState<string | null>(null);
    const [pending, setPending] = useState<PendingMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [moreLoading, setMoreLoading] = useState(false);
    const [error, setError] = useState('');
    const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
    const [category, setCategory] = useState<SupportCategory>('general');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [reply, setReply] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const activeRef = useRef<SupportTicket | null>(null);

    const loadTickets = async (cursor?: string, quiet = false) => {
        if (!quiet) cursor ? setMoreLoading(true) : setLoading(true);
        try {
            const page = await api.get<SupportTicketPage>(`/support/tickets?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
            setTickets(current => cursor ? [...current, ...page.items.filter(item => !current.some(existing => existing.id === item.id))] : page.items);
            setNextCursor(page.next_cursor ?? null);
            setError('');
        } catch {
            if (!quiet) setError('Не удалось загрузить обращения. Попробуйте ещё раз.');
        } finally {
            if (!quiet) { setLoading(false); setMoreLoading(false); }
        }
    };

    const markRead = async (ticketId: string, items: SupportMessage[]) => {
        const latest = items.at(-1);
        if (!latest) return;
        try {
            await api.post(`/support/tickets/${ticketId}/read`, { message_id: latest.id });
            setTickets(current => current.map(ticket => ticket.id === ticketId ? { ...ticket, unread: false } : ticket));
        } catch { }
    };

    const loadThread = async (ticket: SupportTicket, quiet = false) => {
        if (!quiet) setLoading(true);
        try {
            const [detail, page] = await Promise.all([
                api.get<SupportTicket>(`/support/tickets/${ticket.id}`),
                api.get<SupportMessagePage>(`/support/tickets/${ticket.id}/messages?limit=50`),
            ]);
            if (activeRef.current?.id !== ticket.id) return;
            setActive(detail);
            setMessages(page.items);
            setMessageCursor(page.next_cursor ?? null);
            setPending(current => current.filter(item => item.state === 'failed'));
            setError('');
            if (document.hasFocus()) void markRead(ticket.id, page.items);
        } catch {
            if (!quiet) setError('Не удалось загрузить переписку.');
        } finally {
            if (!quiet) setLoading(false);
        }
    };

    useEffect(() => { void loadTickets(); }, []);
    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
    }, []);
    useEffect(() => {
        if (view !== 'thread' || !active) return;
        const refresh = () => { if (document.hasFocus()) void loadThread(active, true); };
        const timer = window.setInterval(refresh, 10000);
        window.addEventListener('focus', refresh);
        return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
    }, [view, active?.id]);

    const openThread = (ticket: SupportTicket) => {
        activeRef.current = ticket;
        setActive(ticket);
        setMessages([]);
        setPending([]);
        setView('thread');
        void loadThread(ticket);
    };

    const loadOlderMessages = async () => {
        if (!active || !messageCursor) return;
        setMoreLoading(true);
        try {
            const page = await api.get<SupportMessagePage>(`/support/tickets/${active.id}/messages?limit=50&before=${encodeURIComponent(messageCursor)}`);
            setMessages(current => [...page.items, ...current]);
            setMessageCursor(page.next_cursor ?? null);
        } catch { setError('Не удалось загрузить ранние сообщения.'); }
        finally { setMoreLoading(false); }
    };

    const createTicket = async (event: FormEvent) => {
        event.preventDefault();
        if (!online || !subject.trim() || !body.trim()) return;
        setSubmitting(true);
        setError('');
        try {
            const result = await api.post<SupportTicketCreateOut>('/support/tickets', {
                client_ticket_id: makeId(), client_message_id: makeId(), category, subject: subject.trim(), body: body.trim(),
            });
            setTickets(current => [result.ticket, ...current.filter(ticket => ticket.id !== result.ticket.id)]);
            setSubject(''); setBody('');
            openThread(result.ticket);
        } catch { setError('Не удалось создать обращение. Проверьте подключение и повторите попытку.'); }
        finally { setSubmitting(false); }
    };

    const sendReply = async (item?: PendingMessage) => {
        if (!active || active.status === 'closed') return;
        const bodyValue = item?.body ?? reply.trim();
        if (!bodyValue) return;
        const clientId = item?.clientId ?? makeId();
        if (!item) { setReply(''); setPending(current => [...current, { clientId, body: bodyValue, state: 'sending' }]); }
        else setPending(current => current.map(value => value.clientId === clientId ? { ...value, state: 'sending' } : value));
        try {
            const sent = await api.post<SupportMessage>(`/support/tickets/${active.id}/messages`, { client_message_id: clientId, body: bodyValue });
            setMessages(current => current.some(message => message.id === sent.id) ? current : [...current, sent]);
            setPending(current => current.filter(value => value.clientId !== clientId));
            void loadTickets(undefined, true);
        } catch {
            setPending(current => current.map(value => value.clientId === clientId ? { ...value, state: 'failed' } : value));
        }
    };

    const goBack = () => {
        activeRef.current = null;
        setActive(null);
        setView('list');
        setError('');
        void loadTickets(undefined, true);
    };

    return <div className={styles.overlay} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <section className={styles.modal} role="dialog" aria-modal="true" aria-label="Поддержка школы">
            <header className={styles.header}>
                <div>{view !== 'list' && <button className={styles.iconButton} onClick={goBack} aria-label="Назад">←</button>}<div><h2>Поддержка школы</h2><p>Обращения обрабатывает ваша школа</p></div></div>
                <button className={styles.iconButton} onClick={onClose} aria-label="Закрыть">×</button>
            </header>
            {error && <div className={styles.error}>{error}</div>}
            {view === 'list' && <div className={styles.listView}>
                <div className={styles.listToolbar}><span>Мои обращения</span><button onClick={() => { setError(''); setView('create'); }} disabled={!online}>Новое обращение</button></div>
                {!online && <div className={styles.offline}>Нет подключения. Просмотр доступен, создание обращения временно недоступно.</div>}
                <div className={styles.ticketList}>{loading ? <div className={styles.empty}>Загрузка...</div> : tickets.length === 0 ? <div className={styles.empty}>У вас пока нет обращений</div> : tickets.map(ticket => <button className={styles.ticket} key={ticket.id} onClick={() => openThread(ticket)}>
                    <div><strong>{ticket.subject}</strong>{ticket.unread && <span className={styles.unread}>Новое</span>}</div>
                    <p>{categories.find(item => item.value === ticket.category)?.label ?? ticket.category}</p>
                    <footer><span className={`${styles.status} ${styles[`status_${ticket.status}`] ?? ''}`}>{statusLabels[ticket.status] ?? ticket.status}</span><time>{formatDate(ticket.last_message_at ?? ticket.updated_at)}</time></footer>
                </button>)}</div>
                {nextCursor && <button className={styles.more} disabled={moreLoading} onClick={() => void loadTickets(nextCursor)}>{moreLoading ? 'Загрузка...' : 'Показать ещё'}</button>}
            </div>}
            {view === 'create' && <form className={styles.create} onSubmit={createTicket}>
                <h3>Новое обращение</h3>
                <label>Категория<select value={category} onChange={event => setCategory(event.target.value as SupportCategory)}>{categories.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
                <label>Тема<input value={subject} onChange={event => setSubject(event.target.value)} maxLength={200} required placeholder="Кратко опишите вопрос" /></label>
                <label>Сообщение<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={5000} required rows={7} placeholder="Расскажите подробнее, что произошло" /></label>
                <p className={styles.attachmentNote}>Вложения пока недоступны. Отправьте описание текстом.</p>
                <button className={styles.primary} disabled={!online || submitting || !subject.trim() || !body.trim()}>{submitting ? 'Отправка...' : 'Создать обращение'}</button>
            </form>}
            {view === 'thread' && active && <div className={styles.thread}>
                <div className={styles.threadTitle}><div><h3>{active.subject}</h3><span>{categories.find(item => item.value === active.category)?.label ?? active.category}</span></div><span className={`${styles.status} ${styles[`status_${active.status}`] ?? ''}`}>{statusLabels[active.status] ?? active.status}</span></div>
                <div className={styles.messages}>
                    {messageCursor && <button className={styles.more} disabled={moreLoading} onClick={() => void loadOlderMessages()}>{moreLoading ? 'Загрузка...' : 'Показать ранние сообщения'}</button>}
                    {loading && messages.length === 0 ? <div className={styles.empty}>Загрузка...</div> : messages.map(message => <article className={`${styles.message} ${message.side === 'requester' ? styles.mine : styles.school}`} key={message.id}><p>{message.body}</p><time>{formatDate(message.created_at)}</time></article>)}
                    {pending.map(item => <article className={`${styles.message} ${styles.mine} ${styles.pending}`} key={item.clientId}><p>{item.body}</p><footer>{item.state === 'sending' ? 'Отправка...' : <button onClick={() => void sendReply(item)}>Не отправлено. Повторить</button>}</footer></article>)}
                </div>
                {active.status === 'closed' ? <div className={styles.closed}>Обращение закрыто школой. Отправка сообщений недоступна.</div> : <form className={styles.composer} onSubmit={event => { event.preventDefault(); void sendReply(); }}><textarea value={reply} onChange={event => setReply(event.target.value)} maxLength={5000} rows={2} placeholder="Напишите сообщение" /><button disabled={!reply.trim()}>Отправить</button><small>Только текст. Вложения пока недоступны.</small></form>}
            </div>}
        </section>
    </div>;
}
