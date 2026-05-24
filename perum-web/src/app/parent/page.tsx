'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/apiClient';

interface Child {
    id: number;
    first_name: string | null;
    last_name: string | null;
    patronymic: string | null;
    balance: number;
    class_name: string | null;
    avg_grade: number;
    total_grades: number;
    enrollment_status: string;
}

interface GradeItem {
    id: number;
    value: number;
    subject_name: string | null;
    work_type: string | null;
    comment: string | null;
    created_at: string | null;
}

interface TransactionItem {
    id: number;
    amount: number;
    balance_after: number;
    type: string;
    reason: string | null;
    created_at: string | null;
}

export default function ParentDashboard() {
    const { token } = useAuth();
    const [children, setChildren] = useState<Child[]>([]);
    const [selectedChild, setSelectedChild] = useState<number | null>(null);
    const [grades, setGrades] = useState<GradeItem[]>([]);
    const [transactions, setTransactions] = useState<TransactionItem[]>([]);
    const [tab, setTab] = useState<'grades' | 'balance'>('grades');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        api.get<{ children: Child[] }>('/parent/children')
            .then(res => {
                setChildren(res.children);
                if (res.children.length > 0) setSelectedChild(res.children[0].id);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [token]);

    useEffect(() => {
        if (!selectedChild || !token) return;
        loadChildData(selectedChild);
    }, [selectedChild, token, tab]);

    const loadChildData = async (childId: number) => {
        if (tab === 'grades') {
            const res = await api.get<{ grades: GradeItem[] }>(`/parent/children/${childId}/grades`);
            setGrades(res.grades);
        } else {
            const res = await api.get<{ transactions: TransactionItem[] }>(`/parent/children/${childId}/transactions`);
            setTransactions(res.transactions);
        }
    };

    const selectedChildData = children.find(c => c.id === selectedChild);

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                Загрузка...
            </div>
        );
    }

    if (children.length === 0) {
        return (
            <div style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>👨‍👩‍👧‍👦</div>
                <h2 style={{ color: 'var(--text-primary)', marginBottom: 8 }}>Добро пожаловать!</h2>
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    К вашему аккаунту пока не привязан ни один ребёнок.
                    Обратитесь к администратору школы для привязки.
                </p>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px' }}>
            <h1 style={{ color: 'var(--text-primary)', marginBottom: 20, fontSize: 22 }}>👨‍👩‍👧 Мои дети</h1>

            {/* Children selector */}
            {children.length > 1 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                    {children.map(child => (
                        <button
                            key={child.id}
                            onClick={() => setSelectedChild(child.id)}
                            style={{
                                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                fontWeight: 500, fontSize: 14,
                                background: selectedChild === child.id ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                color: selectedChild === child.id ? '#fff' : 'var(--text-secondary)',
                            }}
                        >
                            {child.last_name} {child.first_name}
                        </button>
                    ))}
                </div>
            )}

            {/* Child summary card */}
            {selectedChildData && (
                <div style={{
                    background: 'var(--bg-secondary)', borderRadius: 16, padding: 20,
                    border: '1px solid var(--border-color)', marginBottom: 20
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div>
                            <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20 }}>
                                {selectedChildData.last_name} {selectedChildData.first_name} {selectedChildData.patronymic || ''}
                            </h2>
                            <div style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
                                {selectedChildData.class_name || 'Без класса'}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-primary)', borderRadius: 10 }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{selectedChildData.avg_grade}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Средний балл</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-primary)', borderRadius: 10 }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-primary)' }}>{selectedChildData.total_grades}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Оценок</div>
                        </div>
                        <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-primary)', borderRadius: 10 }}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>{selectedChildData.balance}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Баланс</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-secondary)', borderRadius: 10, padding: 4 }}>
                <button
                    onClick={() => setTab('grades')}
                    style={{
                        flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        fontWeight: 500, fontSize: 14,
                        background: tab === 'grades' ? 'var(--accent-primary)' : 'transparent',
                        color: tab === 'grades' ? '#fff' : 'var(--text-secondary)',
                    }}
                >
                    📊 Оценки
                </button>
                <button
                    onClick={() => setTab('balance')}
                    style={{
                        flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        fontWeight: 500, fontSize: 14,
                        background: tab === 'balance' ? 'var(--accent-primary)' : 'transparent',
                        color: tab === 'balance' ? '#fff' : 'var(--text-secondary)',
                    }}
                >
                    💰 Баланс
                </button>
            </div>

            {/* Grades */}
            {tab === 'grades' && (
                <div style={{ display: 'grid', gap: 6 }}>
                    {grades.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Оценок пока нет</div>
                    )}
                    {grades.map(g => (
                        <div key={g.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 14px', borderRadius: 10,
                            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
                        }}>
                            <div>
                                <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 14 }}>{g.subject_name}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {g.work_type || 'Обычная'} • {g.created_at ? new Date(g.created_at).toLocaleDateString('ru') : ''}
                                </div>
                            </div>
                            <div style={{
                                width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: 18,
                                background: g.value >= 4 ? 'rgba(34,197,94,0.1)' : g.value >= 3 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                                color: g.value >= 4 ? '#22c55e' : g.value >= 3 ? '#f59e0b' : '#ef4444'
                            }}>
                                {g.value}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Transactions */}
            {tab === 'balance' && (
                <div style={{ display: 'grid', gap: 6 }}>
                    {transactions.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Транзакций пока нет</div>
                    )}
                    {transactions.map(t => (
                        <div key={t.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 14px', borderRadius: 10,
                            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
                        }}>
                            <div>
                                <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 14 }}>{t.reason || t.type}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {t.created_at ? new Date(t.created_at).toLocaleDateString('ru') : ''}
                                </div>
                            </div>
                            <div style={{
                                fontWeight: 600, fontSize: 15,
                                color: t.amount > 0 ? '#22c55e' : '#ef4444'
                            }}>
                                {t.amount > 0 ? '+' : ''}{t.amount}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
