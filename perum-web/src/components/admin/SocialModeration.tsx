'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import api, { ApiClientError } from '@/lib/apiClient';
import type { ModerationActionCreate, ModerationCaseDetail, ModerationCasePage, ModerationCaseSummary } from '@/types/messages';
import styles from './SocialModeration.module.css';

const labels: Record<string, string> = { open: 'Открыто', dismissed: 'Отклонено', actioned: 'Приняты меры' };
const actions: Array<{ value: ModerationActionCreate['action']; label: string }> = [{ value: 'dismiss', label: 'Отклонить жалобу' }, { value: 'hide_reported_message', label: 'Скрыть сообщение' }, { value: 'lock_conversation', label: 'Заблокировать диалог' }, { value: 'unlock_conversation', label: 'Разблокировать диалог' }];

export default function SocialModeration() {
    const [cases, setCases] = useState<ModerationCaseSummary[]>([]);
    const [cursor, setCursor] = useState<number | null>(null);
    const [filter, setFilter] = useState('all');
    const [detail, setDetail] = useState<ModerationCaseDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [action, setAction] = useState<ModerationActionCreate['action']>('dismiss');
    const [reason, setReason] = useState('');
    const [clientActionId, setClientActionId] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const loadCases = useCallback(async (next?: number) => {
        setLoading(true); setError('');
        try { const page = await api.get<ModerationCasePage>(`/admin/social/moderation/cases${next ? `?cursor=${next}` : ''}`); setCases(current => next ? [...current, ...page.items] : page.items); setCursor(page.next_cursor); }
        catch { setError('Не удалось загрузить очередь модерации'); }
        finally { setLoading(false); }
    }, []);

    const openCase = async (item: ModerationCaseSummary) => {
        setError('');
        try { setDetail(await api.get<ModerationCaseDetail>(`/admin/social/moderation/cases/${item.id}`)); setReason(''); setClientActionId(''); }
        catch { setError('Не удалось открыть материалы обращения'); }
    };

    useEffect(() => { void loadCases(); }, [loadCases]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!detail || !reason.trim()) return;
        const id = clientActionId || crypto.randomUUID();
        if (!clientActionId) setClientActionId(id);
        setSubmitting(true); setError('');
        const payload: ModerationActionCreate = { action, reason: reason.trim(), client_action_id: id, expected_version: detail.version };
        try { await api.post(`/admin/social/moderation/cases/${detail.id}/actions`, payload); await Promise.all([openCase(detail), loadCases()]); }
        catch (value) { if (value instanceof ApiClientError && value.status === 409) { setError('Обращение уже изменено другим модератором. Данные обновлены.'); await openCase(detail); await loadCases(); } else setError('Не удалось выполнить действие. Повторите попытку.'); }
        finally { setSubmitting(false); }
    };

    const visible = filter === 'all' ? cases : cases.filter(item => item.status === filter);
    return <div className={styles.workspace}><section className={styles.inbox}><div className={styles.toolbar}><div><h2>Очередь модерации</h2><p>Содержание сообщений открывается только внутри обращения.</p></div><select aria-label="Статус" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Все статусы</option><option value="open">Открытые</option><option value="actioned">Приняты меры</option><option value="dismissed">Отклонённые</option></select></div>{error && <div className={styles.error}>{error}</div>}<div className={styles.list}>{loading && cases.length === 0 ? <div className={styles.empty}>Загрузка...</div> : visible.length === 0 ? <div className={styles.empty}>В этой части очереди обращений нет</div> : visible.map(item => <button className={`${styles.case} ${detail?.id === item.id ? styles.selected : ''}`} key={item.id} onClick={() => void openCase(item)}><span>Обращение #{item.id}</span><strong>{labels[item.status] ?? item.status}</strong><time>{new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</time></button>)}</div>{cursor !== null && <button className={styles.more} disabled={loading} onClick={() => void loadCases(cursor)}>{loading ? 'Загрузка...' : 'Загрузить ещё'}</button>}</section><section className={styles.detail}>{detail ? <><header><div><span>Обращение #{detail.id}</span><h2>{labels[detail.status] ?? detail.status}</h2></div><button onClick={() => setDetail(null)} aria-label="Закрыть материалы">×</button></header><dl><div><dt>Категория</dt><dd>{detail.category}</dd></div><div><dt>Участник</dt><dd>{detail.other_participant}</dd></div>{detail.comment && <div><dt>Комментарий заявителя</dt><dd>{detail.comment}</dd></div>}</dl><h3>Материалы обращения</h3><div className={styles.evidence}>{detail.evidence.map(message => <article className={message.sender === 'reported' ? styles.reported : ''} key={message.message_id}><div><strong>{message.sender === 'reported' ? 'Сообщение, на которое пожаловались' : message.sender}</strong><time>{new Intl.DateTimeFormat('ru', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(message.created_at))}</time></div><p>{message.body ?? 'Сообщение скрыто'}</p></article>)}</div><form className={styles.actionForm} onSubmit={submit}><h3>Решение</h3><label>Действие<select value={action} onChange={event => { setAction(event.target.value as ModerationActionCreate['action']); setClientActionId(''); }}>{actions.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label>Основание<textarea required maxLength={1000} rows={3} value={reason} onChange={event => { setReason(event.target.value); setClientActionId(''); }} /></label><button disabled={submitting || !reason.trim()}>{submitting ? 'Выполнение...' : 'Применить решение'}</button></form></> : <div className={styles.placeholder}><h2>Выберите обращение</h2><p>Материалы не загружаются до открытия конкретного обращения.</p></div>}</section></div>;
}
