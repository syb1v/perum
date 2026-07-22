'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import api from '@/lib/apiClient';
import type { SupportAssignee, SupportEventPage, SupportMessage, SupportMessagePage, SupportTicket, SupportTicketPage, SupportUnread } from '@/types/support';
import styles from './SchoolSupportInbox.module.css';

type PendingReply = { clientId: string; body: string; state: 'sending' | 'failed' };

const statusLabels: Record<string, string> = {
    open: 'Открыто', in_progress: 'В работе', waiting_requester: 'Ждёт ответа пользователя', resolved: 'Решено', closed: 'Закрыто',
};
const categoryLabels: Record<string, string> = {
    general: 'Общий вопрос', technical: 'Техническая проблема', account: 'Учётная запись', academic: 'Учебный процесс', safety: 'Безопасность', other: 'Другое',
};
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('ru', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '';

export default function SchoolSupportInbox({ onUnreadChange, initialTicketId }: { onUnreadChange?: (count: number) => void; initialTicketId?: string | null }) {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [active, setActive] = useState<SupportTicket | null>(null);
    const [messages, setMessages] = useState<SupportMessage[]>([]);
    const [messageCursor, setMessageCursor] = useState<string | null>(null);
    const [pending, setPending] = useState<PendingReply[]>([]);
    const [reply, setReply] = useState('');
    const [loading, setLoading] = useState(true);
    const [moreLoading, setMoreLoading] = useState(false);
    const [error, setError] = useState('');
    const [assignees, setAssignees] = useState<SupportAssignee[]>([]);
    const [events, setEvents] = useState<SupportEventPage['items']>([]);
    const [saving, setSaving] = useState(false);
    const [escalationSummary, setEscalationSummary] = useState('');
    const activeId = useRef<string | null>(null);

    const refreshUnread = async () => {
        try {
            const unread = await api.get<SupportUnread>('/admin/support/unread-count');
            onUnreadChange?.(unread.messages);
        } catch { }
    };

    const loadTickets = async (cursor?: string, quiet = false) => {
        if (!quiet) cursor ? setMoreLoading(true) : setLoading(true);
        try {
            const page = await api.get<SupportTicketPage>(`/admin/support/tickets?limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
            setTickets(current => cursor ? [...current, ...page.items.filter(item => !current.some(existing => existing.id === item.id))] : page.items);
            setNextCursor(page.next_cursor ?? null);
            setError('');
        } catch { if (!quiet) setError('Не удалось загрузить очередь поддержки.'); }
        finally { if (!quiet) { setLoading(false); setMoreLoading(false); } }
    };

    const markRead = async (ticketId: string, items: SupportMessage[]) => {
        const latest = items.at(-1);
        if (!latest) return;
        try {
            await api.post(`/admin/support/tickets/${ticketId}/read`, { message_id: latest.id });
            setTickets(current => current.map(ticket => ticket.id === ticketId ? { ...ticket, unread: false } : ticket));
            void refreshUnread();
        } catch { }
    };

    const loadThread = async (ticketId: string, quiet = false) => {
        if (!quiet) setLoading(true);
        try {
            const [detail, page, history] = await Promise.all([
                api.get<SupportTicket>(`/admin/support/tickets/${ticketId}`),
                api.get<SupportMessagePage>(`/admin/support/tickets/${ticketId}/messages?limit=50`),
                api.get<SupportEventPage>(`/admin/support/tickets/${ticketId}/events?limit=100`),
            ]);
            if (activeId.current !== ticketId) return;
            setActive(detail);
            setMessages(page.items);
            setMessageCursor(page.next_cursor ?? null);
            setEvents(history.items);
            setPending(current => current.filter(item => item.state === 'failed'));
            setError('');
            if (document.hasFocus()) void markRead(ticketId, page.items);
        } catch { if (!quiet) setError('Не удалось загрузить обращение.'); }
        finally { if (!quiet) setLoading(false); }
    };

    useEffect(() => {
        void loadTickets();
        void refreshUnread();
        void api.get<SupportAssignee[]>('/admin/support/assignees').then(setAssignees).catch(() => undefined);
        const refresh = () => {
            if (!document.hasFocus()) return;
            void loadTickets(undefined, true);
            void refreshUnread();
            if (activeId.current) void loadThread(activeId.current, true);
        };
        const timer = window.setInterval(refresh, 10000);
        window.addEventListener('focus', refresh);
        return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
    }, []);

    useEffect(() => {
        if (!initialTicketId || activeId.current === initialTicketId) return;
        activeId.current = initialTicketId;
        void loadThread(initialTicketId);
    }, [initialTicketId]);

    const openTicket = (ticket: SupportTicket) => {
        activeId.current = ticket.id;
        setActive(ticket);
        setMessages([]);
        setPending([]);
        void loadThread(ticket.id);
    };

    const loadOlder = async () => {
        if (!active || !messageCursor) return;
        setMoreLoading(true);
        try {
            const page = await api.get<SupportMessagePage>(`/admin/support/tickets/${active.id}/messages?limit=50&before=${encodeURIComponent(messageCursor)}`);
            setMessages(current => [...page.items, ...current]);
            setMessageCursor(page.next_cursor ?? null);
        } catch { setError('Не удалось загрузить ранние сообщения.'); }
        finally { setMoreLoading(false); }
    };

    const send = async (event?: FormEvent, retry?: PendingReply) => {
        event?.preventDefault();
        if (!active || active.status === 'closed') return;
        const body = retry?.body ?? reply.trim();
        if (!body) return;
        const clientId = retry?.clientId ?? crypto.randomUUID();
        if (!retry) { setReply(''); setPending(current => [...current, { clientId, body, state: 'sending' }]); }
        else setPending(current => current.map(item => item.clientId === clientId ? { ...item, state: 'sending' } : item));
        try {
            const sent = await api.post<SupportMessage>(`/admin/support/tickets/${active.id}/messages`, { client_message_id: clientId, body });
            setMessages(current => current.some(message => message.id === sent.id) ? current : [...current, sent]);
            setPending(current => current.filter(item => item.clientId !== clientId));
            void loadTickets(undefined, true);
        } catch { setPending(current => current.map(item => item.clientId === clientId ? { ...item, state: 'failed' } : item)); }
    };

    const mutate = async (kind: 'metadata' | 'assign', payload: Record<string, unknown>) => {
        if (!active || saving) return;
        setSaving(true);
        try {
            const endpoint = kind === 'assign' ? `/admin/support/tickets/${active.id}/assign` : `/admin/support/tickets/${active.id}`;
            const body = { client_action_id: crypto.randomUUID(), expected_version: active.version, ...payload };
            if (kind === 'assign') await api.post(endpoint, body);
            else await api.patch(endpoint, body);
            await loadThread(active.id, true);
            await loadTickets(undefined, true);
            setError('');
        } catch (reason) {
            const code = typeof reason === 'object' && reason !== null && 'status' in reason ? Number(reason.status) : 0;
            setError(code === 409 ? 'Обращение изменено другим сотрудником. Данные обновлены.' : 'Не удалось сохранить изменения.');
            await loadThread(active.id, true);
        } finally { setSaving(false); }
    };

    const escalate = async () => {
        if (!active || saving || escalationSummary.trim().length < 10) return;
        setSaving(true);
        try {
            await api.post(`/admin/support/tickets/${active.id}/escalate`, { client_action_id: crypto.randomUUID(), expected_version: active.version, redacted_summary: escalationSummary.trim() });
            setEscalationSummary('');
            await loadThread(active.id, true);
            await loadTickets(undefined, true);
        } catch { setError('Не удалось запросить эскалацию. Проверьте, что персональные данные удалены из резюме.'); }
        finally { setSaving(false); }
    };

    return <div className={styles.workspace}>
        <section className={styles.inbox}>
            <div className={styles.title}><div><h2>Поддержка школы</h2><p>Обращения учеников, учителей и родителей</p></div><button onClick={() => void loadTickets()} disabled={loading}>Обновить</button></div>
            {error && <div className={styles.error}>{error}</div>}
            <div className={styles.list}>{loading && tickets.length === 0 ? <div className={styles.empty}>Загрузка...</div> : tickets.length === 0 ? <div className={styles.empty}>Новых обращений нет</div> : tickets.map(ticket => <button key={ticket.id} className={`${styles.ticket} ${active?.id === ticket.id ? styles.selected : ''}`} onClick={() => openTicket(ticket)}>
                <div><strong>{ticket.subject}</strong>{ticket.unread && <span className={styles.unread}>Новое</span>}</div>
                <p>{categoryLabels[ticket.category] ?? ticket.category}</p>
                <footer><span>{statusLabels[ticket.status] ?? ticket.status}</span><time>{formatDate(ticket.last_message_at ?? ticket.updated_at)}</time></footer>
            </button>)}</div>
            {nextCursor && <button className={styles.more} disabled={moreLoading} onClick={() => void loadTickets(nextCursor)}>{moreLoading ? 'Загрузка...' : 'Загрузить ещё'}</button>}
        </section>
        <section className={styles.detail}>
            {!active ? <div className={styles.placeholder}><strong>Выберите обращение</strong><span>Переписка откроется здесь</span></div> : <>
                <header><div><span>{categoryLabels[active.category] ?? active.category}</span><h2>{active.subject}</h2><small>Статус: {statusLabels[active.status] ?? active.status}</small></div><button onClick={() => { activeId.current = null; setActive(null); }} aria-label="Закрыть обращение">×</button></header>
                <div className={styles.controls}>
                    <label>Статус<select disabled={saving} value={active.status} onChange={event => void mutate('metadata', { status: event.target.value })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label>Категория<select disabled={saving} value={active.category} onChange={event => void mutate('metadata', { category: event.target.value })}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label>Приоритет<select disabled={saving} value={active.priority} onChange={event => void mutate('metadata', { priority: event.target.value })}><option value="low">Низкий</option><option value="normal">Обычный</option><option value="high">Высокий</option><option value="urgent">Срочный</option></select></label>
                    <label>Ответственный<select disabled={saving} defaultValue="" onChange={event => void mutate('assign', { assignee_id: event.target.value ? Number(event.target.value) : null })}><option value="">Не назначен</option>{assignees.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>
                <div className={styles.messages}>
                    {messageCursor && <button className={styles.more} disabled={moreLoading} onClick={() => void loadOlder()}>{moreLoading ? 'Загрузка...' : 'Показать ранние сообщения'}</button>}
                    {loading && messages.length === 0 ? <div className={styles.empty}>Загрузка...</div> : messages.map(message => <article className={`${styles.message} ${message.side === 'shared_inbox' ? styles.staff : styles.requester}`} key={message.id}><p>{message.body}</p><time>{formatDate(message.created_at)}</time></article>)}
                    {pending.map(item => <article className={`${styles.message} ${styles.staff} ${styles.pending}`} key={item.clientId}><p>{item.body}</p>{item.state === 'sending' ? <small>Отправка...</small> : <button onClick={() => void send(undefined, item)}>Не отправлено. Повторить</button>}</article>)}
                </div>
                <details className={styles.history}><summary>История действий ({events.length})</summary>{events.map(item => <div key={item.id}><span>{item.action === 'ticket_updated' ? 'Параметры обращения изменены' : item.action === 'ticket_assigned' ? 'Назначен ответственный' : item.action === 'ticket_unassigned' ? 'Ответственный снят' : item.action === 'message_created' ? 'Добавлено сообщение' : item.action === 'ticket_read' ? 'Обращение прочитано' : 'Обращение создано'}</span><time>{formatDate(item.created_at)}</time></div>)}</details>
                {active.escalation_status === 'none' ? <div className={styles.escalation}><strong>Эскалация в PERUM</strong><p>Передайте только обезличенное резюме. История переписки и данные автора автоматически не отправляются.</p><textarea value={escalationSummary} onChange={event => setEscalationSummary(event.target.value)} maxLength={4000} rows={3} placeholder="Обезличенное описание проблемы" /><button disabled={saving || escalationSummary.trim().length < 10} onClick={() => void escalate()}>Запросить согласование организации</button></div> : <div className={styles.escalation}><strong>Эскалация: {active.escalation_status}</strong></div>}
                {active.status === 'closed' ? <div className={styles.closed}>Обращение закрыто. Ответ недоступен.</div> : <form className={styles.composer} onSubmit={event => void send(event)}><textarea value={reply} onChange={event => setReply(event.target.value)} maxLength={5000} rows={3} placeholder="Ответ от школы" /><button disabled={!reply.trim()}>Отправить</button><small>Только текст. Вложения пока недоступны.</small></form>}
            </>}
        </section>
    </div>;
}
