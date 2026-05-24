
'use client';

import { useState } from 'react';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import styles from '@/app/admin/page.module.css';
import { User } from '@/types';



export default function NotificationManager() {
    const { showSuccess, showError, showWarning } = useToast();
    const [targetType, setTargetType] = useState('all'); // all, role, user
    const [targetRole, setTargetRole] = useState('student');
    const [targetUserId, setTargetUserId] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    // User search for single user selection
    const [userSearch, setUserSearch] = useState('');
    const [foundUsers, setFoundUsers] = useState<User[]>([]);

    const handleSearchUsers = async (query: string) => {
        setUserSearch(query);
        if (query.length < 3) {
            setFoundUsers([]);
            return;
        }


        try {
            const res = await api.get<{ users: User[] }>(`/admin/users/search?query=${encodeURIComponent(query)}`);
            setFoundUsers(res.users);
        } catch (error) {
            console.error(error);
        }
    };

    const handleSend = async () => {
        if (!message.trim()) {
            showWarning('Введите текст сообщения');
            return;
        }

        if (targetType === 'user' && !targetUserId) {
            showWarning('Выберите пользователя');
            return;
        }

        setLoading(true);
        try {
            const payload: Record<string, string | number> = { message };

            if (targetType === 'all') {
                payload.target = 'all';
            } else if (targetType === 'role') {
                payload.target = 'role';
                payload.role = targetRole;
            } else if (targetType === 'user') {
                payload.target = 'user';
                payload.user_id = parseInt(targetUserId);
            }

            await api.post('/admin/notifications/send', payload);
            showSuccess('Уведомление отправлено');
            setMessage('');
            setTargetUserId('');
            setUserSearch('');
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка отправки уведомления');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.card}>
            <div className={styles.sectionHeader}>
                <h2>Рассылка уведомлений</h2>
            </div>

            <div className={styles.formGroup}>
                <label>Кому отправить:</label>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                            type="radio"
                            name="targetType"
                            value="all"
                            checked={targetType === 'all'}
                            onChange={(e) => setTargetType(e.target.value)}
                        />
                        Всем пользователям
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                            type="radio"
                            name="targetType"
                            value="role"
                            checked={targetType === 'role'}
                            onChange={(e) => setTargetType(e.target.value)}
                        />
                        По роли
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                            type="radio"
                            name="targetType"
                            value="user"
                            checked={targetType === 'user'}
                            onChange={(e) => setTargetType(e.target.value)}
                        />
                        Конкретному пользователю
                    </label>
                </div>
            </div>

            {targetType === 'role' && (
                <div className={styles.formGroup}>
                    <label>Выберите роль:</label>
                    <select value={targetRole} onChange={(e) => setTargetRole(e.target.value)}>
                        <option value="student">Ученики</option>
                        <option value="teacher">Учителя</option>
                        <option value="admin">Администраторы</option>
                    </select>
                </div>
            )}

            {targetType === 'user' && (
                <div className={styles.formGroup}>
                    <label>Поиск пользователя:</label>
                    <input
                        type="text"
                        placeholder="Введите имя или логин..."
                        value={userSearch}
                        onChange={(e) => handleSearchUsers(e.target.value)}
                    />
                    {foundUsers.length > 0 && (
                        <div style={{
                            marginTop: '4px',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-md)',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            background: 'var(--bg-input)'
                        }}>
                            {foundUsers.map(u => (
                                <div
                                    key={u.id}
                                    style={{
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid var(--border-color)',
                                        background: targetUserId === u.id.toString() ? 'var(--accent-primary)' : 'transparent',
                                        color: targetUserId === u.id.toString() ? 'white' : 'inherit'
                                    }}
                                    onClick={() => {
                                        setTargetUserId(u.id.toString());
                                        setUserSearch(`${u.last_name} ${u.first_name} (${u.login})`);
                                        setFoundUsers([]);
                                    }}
                                >
                                    {u.last_name} {u.first_name} ({u.login})
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className={styles.formGroup}>
                <label>Текст сообщения:</label>
                <textarea
                    rows={5}
                    placeholder="Введите текст уведомления..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                ></textarea>
            </div>

            <div className={styles.registerActions}>
                <button className={styles.btnPrimary} onClick={handleSend} disabled={loading}>
                    {loading ? 'Отправка...' : 'Отправить уведомление'}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '8px' }}>
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>
        </div>
    );
}
