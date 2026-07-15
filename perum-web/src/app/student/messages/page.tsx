'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSocialRealtime } from '@/hooks/useSocialRealtime';
import api from '@/lib/apiClient';
import type { Conversation, ConversationPage } from '@/types/messages';
import styles from './page.module.css';

function merge(items: Conversation[], incoming: Conversation[]) {
    const values = new Map(items.map(item => [item.id, item]));
    incoming.forEach(item => values.set(item.id, item));
    return [...values.values()];
}

function time(value: string) {
    return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export default function MessagesPage() {
    const { user } = useAuth();
    const [items, setItems] = useState<Conversation[]>([]);
    const [cursor, setCursor] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [moreLoading, setMoreLoading] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async (nextCursor?: number, quiet = false) => {
        if (!quiet) nextCursor === undefined ? setLoading(true) : setMoreLoading(true);
        setError('');
        try {
            const query = nextCursor === undefined ? '' : `?cursor=${nextCursor}`;
            const data = await api.get<ConversationPage>(`/social/conversations${query}`);
            setItems(current => nextCursor === undefined ? data.items : merge(current, data.items));
            setCursor(data.next_cursor);
        } catch {
            if (!quiet) setError('Не удалось загрузить сообщения');
        } finally {
            setLoading(false);
            setMoreLoading(false);
        }
    }, []);

    const realtime = useSocialRealtime({ enabled: !!user, onReconcile: () => void load(undefined, true), onListChange: () => void load(undefined, true), onUnreadChange: () => window.dispatchEvent(new Event('social_unread_change')) });

    useEffect(() => {
        void load();
        const interval = window.setInterval(() => void load(undefined, true), realtime === 'connected' ? 45000 : 15000);
        const refresh = () => { if (document.visibilityState === 'visible') void load(undefined, true); };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
    }, [load, realtime]);

    return <main className={styles.page}>
        <header className={styles.title}><div><span>Общение</span><h1>Сообщения</h1></div><div className={styles.headingMeta}><p>Личные диалоги с друзьями</p><small className={styles.realtime} data-state={realtime}>{realtime === 'connected' ? 'В реальном времени' : realtime === 'reconnecting' ? 'Подключение...' : 'Обновление опросом'}</small></div></header>
        {error && <div className={styles.error}>{error}<button onClick={() => void load()}>Повторить</button></div>}
        {loading ? <div className={styles.state}>Загрузка диалогов...</div> : items.length === 0 ? <div className={styles.state}><strong>Диалогов пока нет</strong><span>Начните разговор со страницы друзей</span><Link href="/friends">Перейти к друзьям</Link></div> : <section className={styles.list} aria-label="Диалоги">
            {items.map(item => <Link className={styles.conversation} href={`/messages/${item.id}`} key={item.id}>
                <div className={styles.avatar}>{item.peer.avatar ? <img src={item.peer.avatar} alt="" /> : item.peer.name.slice(0, 1)}</div>
                <div className={styles.content}><div className={styles.row}><strong>{item.peer.name}</strong>{item.last_message && <time>{time(item.last_message.created_at)}</time>}</div><span className={styles.className}>{item.peer.class_name}</span><div className={styles.preview}>{item.last_message?.body || 'Диалог создан'}</div>{!item.can_send && <span className={styles.readOnly}>Только чтение</span>}</div>
                {item.unread_count > 0 && <b className={styles.unread} aria-label={`Непрочитанных: ${item.unread_count}`}>{item.unread_count > 99 ? '99+' : item.unread_count}</b>}
            </Link>)}
            {cursor !== null && <button className={styles.more} disabled={moreLoading} onClick={() => void load(cursor)}>{moreLoading ? 'Загрузка...' : 'Показать ещё'}</button>}
        </section>}
    </main>;
}
