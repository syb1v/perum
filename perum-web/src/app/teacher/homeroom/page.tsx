'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/apiClient';
import { useToast } from '@/context/ToastContext';
import styles from '../page.module.css';
import { CoinIcon } from '@/components/ui/CoinIcon';

interface Student {
    id: number;
    login: string;
    first_name: string | null;
    last_name: string | null;
    patronymic: string | null;
    balance: number;
    is_online: boolean;
    enrollment_status: string;
}

interface ClassStats {
    student_count: number;
    avg_balance: number;
    total_grades: number;
    avg_grade: number;
}

interface ClassInfo {
    id: number;
    name: string;
    grade_level: number | null;
    is_profile: number;
}

interface MyClassData {
    has_class: boolean;
    class: ClassInfo | null;
    students: Student[];
    stats: ClassStats;
}

export default function HomeroomPage() {
    const { token } = useAuth();
    const { showSuccess, showError } = useToast();
    const [data, setData] = useState<MyClassData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [amount, setAmount] = useState(0);
    const [comment, setComment] = useState('');
    const [bulkLoading, setBulkLoading] = useState(false);

    useEffect(() => {
        if (!token) return;
        loadData();
    }, [token]);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await api.get<MyClassData>('/teacher/my-class');
            setData(res);
        } catch {
            setData(null);
        }
        setLoading(false);
    };

    const toggleAll = () => {
        if (!data) return;
        if (selected.size === data.students.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(data.students.map(s => s.id)));
        }
    };

    const toggleStudent = (id: number) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleBulkBalance = async () => {
        if (selected.size === 0 || amount === 0) return;
        setBulkLoading(true);
        try {
            const res = await api.post<{ message: string }>('/teacher/my-class/bulk-balance', {
                student_ids: Array.from(selected),
                amount,
                comment: comment || undefined
            });
            showSuccess(res.message);
            setSelected(new Set());
            setAmount(0);
            setComment('');
            loadData();
        } catch (e: any) {
            showError(e?.message || 'Ошибка');
        }
        setBulkLoading(false);
    };

    if (loading) {
        return (
            <div className={styles.dashboard}>
                <div style={{ textAlign: 'center', padding: 60 }}>
                    <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>
                </div>
            </div>
        );
    }

    if (!data || !data.has_class) {
        return (
            <div className={styles.dashboard}>
                <div style={{ textAlign: 'center', padding: 60 }}>
                    <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Мой класс</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Вы не назначены классным руководителем ни одного класса</p>
                </div>
            </div>
        );
    }

    const cls = data.class!;
    const stats = data.stats;

    return (
        <div className={styles.dashboard}>
            <div className={styles.tabsHeader}>
                <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center', width: '100%' }}>
                    Мой класс — {cls.name}{cls.is_profile ? ' (профильный)' : ''}
                </h2>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24, padding: '0 16px' }}>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{stats.student_count}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Учеников</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#f59e0b' }}>{stats.avg_balance}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Сред. баланс</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{stats.avg_grade}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Сред. балл</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-primary)' }}>{stats.total_grades}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Всего оценок</div>
                </div>
            </div>

            {/* Bulk balance */}
            <div style={{ margin: '0 16px 20px', padding: 16, background: 'var(--bg-secondary)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
                <h3 style={{ margin: '0 0 12px 0', color: 'var(--text-primary)', fontSize: 16 }}>Массовое начисление</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        type="number"
                        value={amount || ''}
                        onChange={e => setAmount(Number(e.target.value))}
                        placeholder="Кол-во ливок"
                        style={{ flex: 1, minWidth: 120, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14 }}
                    />
                    <input
                        type="text"
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="Комментарий (необязательно)"
                        style={{ flex: 2, minWidth: 160, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 14 }}
                    />
                    <button
                        onClick={handleBulkBalance}
                        disabled={bulkLoading || selected.size === 0 || amount === 0}
                        style={{
                            padding: '8px 18px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                            background: selected.size > 0 && amount !== 0 ? 'var(--accent-gradient)' : 'var(--bg-tertiary)',
                            color: selected.size > 0 && amount !== 0 ? '#fff' : 'var(--text-muted)',
                            opacity: bulkLoading ? 0.5 : 1
                        }}
                    >
                        {bulkLoading ? '...' : `Начислить (${selected.size})`}
                    </button>
                </div>
            </div>

            {/* Students list */}
            <div style={{ margin: '0 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 16 }}>Ученики</h3>
                    <button
                        onClick={toggleAll}
                        style={{ padding: '4px 12px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                        {selected.size === data.students.length ? 'Снять все' : 'Выбрать всех'}
                    </button>
                </div>

                <div style={{ display: 'grid', gap: 6 }}>
                    {data.students.map(s => (
                        <div
                            key={s.id}
                            onClick={() => toggleStudent(s.id)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                                background: selected.has(s.id) ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-secondary)',
                                border: `1px solid ${selected.has(s.id) ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 20, height: 20, borderRadius: 4,
                                    border: `2px solid ${selected.has(s.id) ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                                    background: selected.has(s.id) ? 'var(--accent-primary)' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {selected.has(s.id) && (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    )}
                                </div>
                                <div>
                                    <div style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: 14 }}>
                                        {s.last_name} {s.first_name} {s.patronymic || ''}
                                        {s.is_online && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginLeft: 6 }} />}
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.login}</div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600, color: '#f59e0b', fontSize: 15, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                    {s.balance} <CoinIcon id={`homeroom-coin-${s.id}`} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
