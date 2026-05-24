'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import styles from '@/app/admin/page.module.css';
import Modal from '@/components/ui/Modal';

interface QuestStats {
    total: number;
    active: number;
    taken: number;
    completion_rate: number;
}

interface AdminQuest {
    id: number;
    title: string;
    description: string;
    reward: number;
    status: string;
    conditions?: string;
    category?: string;
    quest_type?: string;
    type?: string;
    school_id?: number | null;
}

export default function QuestManagement() {
    const { user } = useAuth();
    const { showSuccess, showError } = useToast();
    const [quests, setQuests] = useState<AdminQuest[]>([]);
    const [stats, setStats] = useState<QuestStats>({ total: 0, active: 0, taken: 0, completion_rate: 0 });
    const [filter, setFilter] = useState('all'); 
    const [loading, setLoading] = useState(false);
    const [schools, setSchools] = useState<{ id: number; name: string }[]>([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingQuest, setEditingQuest] = useState<AdminQuest | null>(null);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        reward: 50,
        type: 'daily_login',
        target: 1,
        expires_at: '',
        school_id: '' as string
    });

    const isSystemAdmin = user?.role === 'system_admin';

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const questsRes = await api.get<AdminQuest[]>('/quests');
            const questsList = Array.isArray(questsRes) ? questsRes : (questsRes as unknown as { quests: AdminQuest[] }).quests || [];
            
            let filtered = questsList;
            if (filter !== 'all') {
                filtered = questsList.filter((q: { status: string }) => filter === 'active' ? q.status === 'available' || q.status === 'active' : q.status === 'completed' || q.status === 'expired');
            }
            
            setQuests(filtered);
            setStats({
                total: questsList.length,
                active: questsList.filter((q: { status: string }) => q.status === 'available' || q.status === 'active').length,
                taken: 0, 
                completion_rate: 0
            });
        } catch (error) {
            console.error(error);
            showError('Не удалось загрузить квесты');
        } finally {
            setLoading(false);
        }
    }, [filter, showError]);

    const fetchSchools = useCallback(async () => {
        if (!isSystemAdmin) return;
        try {
            const res = await api.get<{ id: number; name: string }[]>('/admin/system/schools');
            setSchools(Array.isArray(res) ? res : []);
        } catch (e) {
            console.error('Failed to load schools', e);
        }
    }, [isSystemAdmin]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        fetchSchools();
    }, [fetchSchools]);

    const handleOpenModal = (quest: AdminQuest | null = null) => {
        setEditingQuest(quest);
        if (quest) {
            let parsedTarget = 1;
            try {
                if (quest.conditions) {
                    const cond = JSON.parse(quest.conditions);
                    parsedTarget = cond.target_count || cond.target_avg || 1;
                }
            } catch {
                // Ignore parsing errors
            }
            
            setFormData({
                title: quest.title || '',
                description: quest.description || '',
                reward: quest.reward || 50,
                type: quest.quest_type || 'daily_login',
                target: parsedTarget,
                expires_at: '',
                school_id: quest.school_id != null ? String(quest.school_id) : ''
            });
        } else {
            setFormData({
                title: '',
                description: '',
                reward: 50,
                type: 'daily_login',
                target: 1,
                expires_at: '',
                school_id: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.title || !formData.description) {
            showError('Заполните название и описание');
            return;
        }

        const payload: Record<string, unknown> = {
            title: formData.title,
            description: formData.description,
            reward: formData.reward,
            quest_type: formData.type,
            conditions: JSON.stringify({ target_count: formData.target }),
            status: 'available'
        };

        if (isSystemAdmin && formData.school_id) {
            payload.school_id = parseInt(formData.school_id);
        }

        try {
            if (editingQuest) {
                await api.put(`/quests/${editingQuest.id}`, payload);
                showSuccess('Квест обновлен');
            } else {
                await api.post('/quests', payload);
                showSuccess('Квест создан');
            }
            setIsModalOpen(false);
            fetchData();
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка сохранения');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Удалить этот квест?')) return;
        try {
            await api.del(`/quests/${id}`);
            showSuccess('Квест удален');
            fetchData();
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка удаления');
        }
    };

    return (
        <div className={styles.card}>
            <div className={styles.sectionHeader} style={{ justifyContent: 'space-between' }}>
                <h2>Управление квестами</h2>
                <button className={styles.btnPrimary} onClick={() => handleOpenModal()}>
                    + Создать квест
                </button>
            </div>

            <div className={styles.questStatsGrid}>
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>Всего квестов</span>
                    <span className={styles.statValue}>{stats.total}</span>
                </div>
                <div className={styles.statItem}>
                    <span className={styles.statLabel}>Активные</span>
                    <span className={styles.statValue}>{stats.active}</span>
                </div>
            </div>

            <div className={styles.questTabs}>
                <button className={`${styles.questTab} ${filter === 'all' ? styles.active : ''}`} onClick={() => setFilter('all')}>Все</button>
                <button className={`${styles.questTab} ${filter === 'active' ? styles.active : ''}`} onClick={() => setFilter('active')}>Активные</button>
            </div>

            <div className={styles.grid}>
                {loading ? (
                    <p className={styles.empty}>Загрузка...</p>
                ) : quests.length === 0 ? (
                    <p className={styles.empty}>Квесты не найдены</p>
                ) : (
                    quests.map(quest => (
                        <div key={quest.id} className={styles.card} style={{ marginBottom: 0, position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px' }}>
                                <button className={styles.actionBtn} onClick={() => handleOpenModal(quest)}>✏️</button>
                                <button className={`${styles.actionBtn} ${styles.danger}`} onClick={() => { if (quest.id) handleDelete(quest.id) }}>🗑️</button>
                            </div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, paddingRight: '60px' }}>{quest.title}</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '8px 0' }}>{quest.description}</p>
                            <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <span className={styles.questReward}>+{quest.reward} 💰</span>
                                <span>Тип: {quest.quest_type || quest.type}</span>
                                <span>Цель: {(() => {
                                    try {
                                        return JSON.parse(quest.conditions || '{}').target_count || 1;
                                    } catch { return 1; }
                                })()}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingQuest ? 'Редактировать квест' : 'Новый квест'}>
                <div className={styles.modalBody}>
                    <div className={styles.formGroup}>
                        <label>Название</label>
                        <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Описание</label>
                        <textarea rows={3} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
                    </div>
                    <div className={styles.formGroup} style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                            <label>Награда (ливки)</label>
                            <input type="number" value={formData.reward} onChange={(e) => setFormData({ ...formData, reward: parseInt(e.target.value) })} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label>Цель (количество)</label>
                            <input type="number" value={formData.target} onChange={(e) => setFormData({ ...formData, target: parseInt(e.target.value) })} />
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label>Тип квеста</label>
                        <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                            <option value="daily_login">Ежедневный (Вход)</option>
                            <option value="positive_grades">Положительные оценки</option>
                            <option value="no_threes">Оценки без троек</option>
                            <option value="raise_avg">Повышение среднего балла</option>
                        </select>
                    </div>

                    {isSystemAdmin && (
                        <div className={styles.formGroup}>
                            <label>Школа (оставьте пустым для всех школ)</label>
                            <select
                                value={formData.school_id}
                                onChange={(e) => setFormData({ ...formData, school_id: e.target.value })}
                            >
                                <option value="">Все школы (глобально)</option>
                                {schools.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className={styles.registerActions} style={{ marginTop: '24px' }}>
                        <button className={styles.btnSecondary} onClick={() => setIsModalOpen(false)}>Отмена</button>
                        <button className={styles.btnPrimary} onClick={handleSave}>Сохранить</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}