'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Conversation } from '@/types/messages';
import api from '@/lib/apiClient';
import styles from './page.module.css';

type StudentDto = { id: number; name: string; avatar: string | null; class_name: string };
type StudentPageDto = { items: StudentDto[]; next_cursor: number | null };
type RequestDto = { id: number; status: string; student: StudentDto; created_at: string; expires_at: string };
type BlockDto = { id: number; student: StudentDto; reason_code: string | null; created_at: string };
type Tab = 'friends' | 'requests' | 'search' | 'blocks';

const tabs: { id: Tab; label: string }[] = [{ id: 'friends', label: 'Друзья' }, { id: 'requests', label: 'Заявки' }, { id: 'search', label: 'Поиск' }, { id: 'blocks', label: 'Блокировки' }];

export default function FriendsPage() {
    const router = useRouter();
    const [tab, setTab] = useState<Tab>('friends');
    const [friends, setFriends] = useState<StudentDto[]>([]);
    const [incoming, setIncoming] = useState<RequestDto[]>([]);
    const [outgoing, setOutgoing] = useState<RequestDto[]>([]);
    const [blocks, setBlocks] = useState<BlockDto[]>([]);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<StudentDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState('');
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            const [friendsData, incomingData, outgoingData, blocksData] = await Promise.all([
                api.get<StudentPageDto>('/social/friends'),
                api.get<RequestDto[]>('/social/friend-requests?direction=incoming'),
                api.get<RequestDto[]>('/social/friend-requests?direction=outgoing'),
                api.get<BlockDto[]>('/social/blocks'),
            ]);
            setFriends(friendsData.items); setIncoming(incomingData); setOutgoing(outgoingData); setBlocks(blocksData);
        } catch { setError('Не удалось загрузить данные'); } finally { setLoading(false); }
    };

    useEffect(() => { void load(); }, []);
    useEffect(() => {
        if (tab !== 'search') return;
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            api.get<StudentPageDto>(`/social/students?query=${encodeURIComponent(query.trim())}`, controller.signal)
                .then(data => setResults(data.items)).catch(errorValue => { if (errorValue?.name !== 'AbortError') setError('Поиск недоступен'); });
        }, 350);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [query, tab]);

    const act = async (key: string, action: () => Promise<unknown>) => {
        setPending(key); setError('');
        try { await action(); await load(); } catch { setError('Не удалось выполнить действие'); } finally { setPending(''); }
    };

    const card = (student: StudentDto, actions: React.ReactNode) => <article className={styles.person} key={student.id}><div className={styles.avatar}>{student.avatar ? <img src={student.avatar} alt="" /> : student.name.slice(0, 1)}</div><div className={styles.identity}><strong>{student.name}</strong><span>{student.class_name}</span></div><div className={styles.actions}>{actions}</div></article>;
    const button = (label: string, key: string, action: () => Promise<unknown>, secondary = false) => <button className={secondary ? styles.secondary : ''} disabled={Boolean(pending)} onClick={() => act(key, action)}>{pending === key ? 'Подождите...' : label}</button>;

    let content: React.ReactNode;
    if (loading) content = <div className={styles.empty}>Загрузка...</div>;
    else if (tab === 'friends') content = friends.length ? friends.map(student => card(student, <>{button('Написать', `message-${student.id}`, async () => { const conversation = await api.post<Conversation>('/social/conversations', { student_id: student.id }); router.push(`/messages/${conversation.id}`); })}{button('Удалить', `remove-${student.id}`, () => api.del(`/social/friends/${student.id}`), true)}{button('Заблокировать', `block-${student.id}`, () => api.post('/social/blocks', { student_id: student.id }))}</>)) : <div className={styles.empty}>Здесь появятся ваши друзья</div>;
    else if (tab === 'requests') content = incoming.length || outgoing.length ? <><h2>Входящие</h2>{incoming.map(request => card(request.student, <>{button('Принять', `accept-${request.id}`, () => api.post(`/social/friend-requests/${request.id}/accept`))}{button('Отклонить', `reject-${request.id}`, () => api.post(`/social/friend-requests/${request.id}/reject`), true)}</>))}<h2>Исходящие</h2>{outgoing.map(request => card(request.student, button('Отменить', `cancel-${request.id}`, () => api.post(`/social/friend-requests/${request.id}/cancel`), true)))}</> : <div className={styles.empty}>Нет новых заявок</div>;
    else if (tab === 'blocks') content = blocks.length ? blocks.map(block => card(block.student, button('Разблокировать', `unblock-${block.student.id}`, () => api.del(`/social/blocks/${block.student.id}`), true))) : <div className={styles.empty}>Список блокировок пуст</div>;
    else content = <><div className={styles.search}><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Имя или класс" aria-label="Поиск учеников" /></div>{results.length ? results.map(student => card(student, <>{button('Добавить', `send-${student.id}`, () => api.post('/social/friend-requests', { student_id: student.id, client_request_id: crypto.randomUUID() }))}{button('Заблокировать', `block-${student.id}`, () => api.post('/social/blocks', { student_id: student.id }), true)}</>)) : <div className={styles.empty}>Введите имя, чтобы найти ученика</div>}</>;

    return <main className={styles.page}><div className={styles.title}><div><span>Сообщество</span><h1>Друзья</h1></div><p>Находите одноклассников и управляйте заявками</p></div><nav className={styles.tabs}>{tabs.map(item => <button key={item.id} className={tab === item.id ? styles.active : ''} onClick={() => setTab(item.id)}>{item.label}{item.id === 'requests' && incoming.length > 0 ? <b>{incoming.length}</b> : null}</button>)}</nav>{error && <div className={styles.error}>{error}</div>}<section className={styles.list}>{content}</section></main>;
}
