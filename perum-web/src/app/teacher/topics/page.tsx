'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import styles from './page.module.css';

interface SubjectInfo {
    id: number;
    name: string;
}

interface Topic {
    id: number;
    name: string;
    description: string;
    order_num: number;
}

export default function TopicsPage() {
    useAuth(); // ensure auth context
    const { showToast } = useToast();

    const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
    const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [loading, setLoading] = useState(true);

    const [newTopicName, setNewTopicName] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const [editingTopicId, setEditingTopicId] = useState<number | null>(null);
    const [editTopicName, setEditTopicName] = useState('');

    useEffect(() => {
        api.get<unknown>('/journal/teacher/subjects')
            .then((data: unknown) => {
                const uniqueSubjects = new Map<number, SubjectInfo>();
                const responseData = data as { classes?: { subjects: { id: number; name: string }[] }[] };
                if (responseData.classes) {
                    responseData.classes.forEach((cls) => {
                        cls.subjects.forEach((subj) => {
                            if (!uniqueSubjects.has(subj.id)) {
                                uniqueSubjects.set(subj.id, { id: subj.id, name: subj.name });
                            }
                        });
                    });
                }
                const subjList = Array.from(uniqueSubjects.values()).sort((a, b) => a.name.localeCompare(b.name));
                setSubjects(subjList);
                if (subjList.length > 0) {
                    setSelectedSubjectId(subjList[0].id);
                }
            })
            .catch(() => showToast('Ошибка при загрузке предметов', 'error'))
            .finally(() => setLoading(false));
    }, [showToast]);

    useEffect(() => {
        if (!selectedSubjectId) return;
        setLoading(true);
        api.get<{ topics: Topic[] }>(`/journal/subjects/${selectedSubjectId}/topics`)
            .then((data) => {
                setTopics(data.topics || []);
            })
            .catch(() => showToast('Ошибка при загрузке тем', 'error'))
            .finally(() => setLoading(false));
    }, [selectedSubjectId, showToast]);

    const handleAddTopic = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTopicName.trim() || !selectedSubjectId) return;

        setIsAdding(true);
        try {
            const res = await api.post<Topic>(`/journal/subjects/${selectedSubjectId}/topics`, { name: newTopicName });
            setTopics([...topics, res].sort((a, b) => a.order_num - b.order_num));
            setNewTopicName('');
            showToast('Тема добавлена', 'success');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            showToast(error.response?.data?.detail || 'Ошибка при добавлении темы', 'error');
        } finally {
            setIsAdding(false);
        }
    };

    const handleDeleteTopic = async (topicId: number) => {
        if (!confirm('Вы действительно хотите удалить эту тему?')) return;
        try {
            await api.del(`/journal/topics/${topicId}`);
            setTopics(topics.filter(t => t.id !== topicId));
            showToast('Тема удалена', 'success');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            showToast(error.response?.data?.detail || 'Ошибка при удалении', 'error');
        }
    };

    const handleSaveEdit = async () => {
        if (!editingTopicId || !editTopicName.trim()) return;
        try {
            const res = await api.put<Topic>(`/journal/topics/${editingTopicId}`, { name: editTopicName });
            setTopics(topics.map(t => t.id === editingTopicId ? res : t));
            setEditingTopicId(null);
            showToast('Тема обновлена', 'success');
        } catch (err: unknown) {
            const error = err as { response?: { data?: { detail?: string } } };
            showToast(error.response?.data?.detail || 'Ошибка при обновлении', 'error');
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Темы учебных занятий</h1>
            </div>

            <div className={styles.layout}>
                <div className={styles.sidebar}>
                    <h2 className={styles.sidebarTitle}>Ваши предметы</h2>
                    <div className={styles.subjectList}>
                        {subjects.map(subj => (
                            <button
                                key={subj.id}
                                className={`${styles.subjectBtn} ${selectedSubjectId === subj.id ? styles.subjectBtnActive : ''}`}
                                onClick={() => setSelectedSubjectId(subj.id)}
                            >
                                {subj.name}
                            </button>
                        ))}
                        {subjects.length === 0 && !loading && (
                            <div style={{ color: 'var(--text-muted)' }}>Нет предметов</div>
                        )}
                    </div>
                </div>

                <div className={styles.mainContent}>
                    {loading && subjects.length > 0 ? (
                        <div className={styles.emptyState}>Загрузка...</div>
                    ) : !selectedSubjectId ? (
                        <div className={styles.emptyState}>Выберите предмет слева</div>
                    ) : (
                        <>
                            <div className={styles.topBar}>
                                <form className={styles.addForm} onSubmit={handleAddTopic}>
                                    <input
                                        type="text"
                                        placeholder="Название новой темы..."
                                        className={styles.input}
                                        value={newTopicName}
                                        onChange={e => setNewTopicName(e.target.value)}
                                        disabled={isAdding}
                                    />
                                    <button type="submit" className={styles.btnPrimary} disabled={!newTopicName.trim() || isAdding}>
                                        Добавить тему
                                    </button>
                                </form>
                            </div>

                            <div className={styles.topicsList}>
                                {topics.length === 0 ? (
                                    <div className={styles.emptyState}>Нет добавленных тем</div>
                                ) : (
                                    topics.map(topic => (
                                        <div key={topic.id} className={styles.topicItem}>
                                            {editingTopicId === topic.id ? (
                                                <div className={styles.editForm}>
                                                    <input
                                                        type="text"
                                                        className={styles.input}
                                                        value={editTopicName}
                                                        onChange={e => setEditTopicName(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <button className={styles.btnPrimary} onClick={handleSaveEdit}>Сохранить</button>
                                                    <button className={styles.btnSecondary} onClick={() => setEditingTopicId(null)}>Отмена</button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className={styles.topicInfo}>
                                                        <div className={styles.topicOrder}>{topic.order_num}</div>
                                                        <div className={styles.topicName}>{topic.name}</div>
                                                    </div>
                                                    <div className={styles.topicActions}>
                                                        <button
                                                            className={styles.iconBtn}
                                                            onClick={() => {
                                                                setEditingTopicId(topic.id);
                                                                setEditTopicName(topic.name);
                                                            }}
                                                            title="Редактировать"
                                                        >
                                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                                                        </button>
                                                        <button
                                                            className={`${styles.iconBtn} ${styles.iconBtnDelete}`}
                                                            onClick={() => handleDeleteTopic(topic.id)}
                                                            title="Удалить"
                                                        >
                                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
