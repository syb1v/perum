'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import styles from '@/app/admin/page.module.css';
import Modal from '@/components/ui/Modal';
import { Subject } from '@/types';

// Types extension for this component
interface Class {
    id: number;
    name: string;
}

interface Teacher {
    id: number;
    login: string;
    first_name: string | null;
    last_name: string | null;
    patronymic: string | null;
}

interface SubjectAssignment {
    id: number;
    teacher: { id: number; name: string };
    class_val: { id: number; name: string };
}

interface SubjectExtended extends Subject {
    assignments?: SubjectAssignment[];
}

export default function SubjectManagement() {
    const { showSuccess, showError } = useToast();
    const [subjects, setSubjects] = useState<SubjectExtended[]>([]);
    const [teachers, setTeachers] = useState<Teacher[]>([]);
    const [classes, setClasses] = useState<Class[]>([]);
    const [loading, setLoading] = useState(false);

    // Modal state for Subjects
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSubject, setEditingSubject] = useState<SubjectExtended | null>(null);
    const [formData, setFormData] = useState<{
        name: string;
        short_name: string;
        category: 'profile' | 'normal' | 'minor';
        profile_weight: number;
        is_profile_track: boolean;
        in_exchange: boolean;
        exchange_coefficient: number;
    }>({
        name: '',
        short_name: '',
        category: 'normal',
        profile_weight: 1.0,
        is_profile_track: false,
        in_exchange: false,
        exchange_coefficient: 1.0,
    });

    // Modal state for Appointments
    const [isAppointModalOpen, setIsAppointModalOpen] = useState(false);
    const [selectedSubject, setSelectedSubject] = useState<SubjectExtended | null>(null);
    const [appointData, setAppointData] = useState<{ teacher_ids: number[], class_ids: number[] }>({ teacher_ids: [], class_ids: [] });

    // Filter
    const [searchQuery, setSearchQuery] = useState('');

    const fetchData = useCallback(async (showLoader = true) => {
        if (showLoader) setLoading(true);
        try {
            const [subjectsRes, teachersRes, classesRes] = await Promise.all([
                api.get<{ subjects: SubjectExtended[] }>('/admin/subjects'),
                api.get<{ teachers: Teacher[] }>('/admin/teachers'),
                api.get<{ classes: Class[] }>('/admin/classes')
            ]);
            setSubjects(subjectsRes.subjects || []);
            setTeachers(teachersRes.teachers || []);
            setClasses(classesRes.classes || []);
        } catch (error) {
            console.error(error);
            showError('Не удалось загрузить данные');
        } finally {
            if (showLoader) setLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Subject operations
    const handleOpenModal = (subject: SubjectExtended | null = null) => {
        setEditingSubject(subject);
        setFormData({
            name: subject?.name ?? '',
            short_name: subject?.short_name ?? '',
            category: (subject?.category as 'profile' | 'normal' | 'minor') ?? 'normal',
            profile_weight: subject?.profile_weight ?? 1.0,
            is_profile_track: subject?.is_profile_track ?? false,
            in_exchange: subject?.in_exchange ?? false,
            exchange_coefficient: subject?.exchange_coefficient ?? 1.0,
        });
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) {
            showError('Введите название предмета');
            return;
        }

        try {
            if (editingSubject) {
                await api.put(`/admin/subjects/${editingSubject.id}`, formData);
                showSuccess('Предмет обновлен');
            } else {
                await api.post('/admin/subjects', formData);
                showSuccess('Предмет создан');
            }
            setIsModalOpen(false);
            fetchData(false);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка сохранения');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Вы уверены, что хотите удалить этот предмет?')) return;

        try {
            await api.del(`/admin/subjects/${id}`);
            showSuccess('Предмет удален');
            fetchData(false);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка удаления');
        }
    };

    // Assignment operations
    const handleOpenAppointModal = (subject: SubjectExtended) => {
        setSelectedSubject(subject);
        const activeTeachers = new Set(subject.assignments?.map(a => a.teacher.id) || []);
        const activeClasses = new Set(subject.assignments?.map(a => a.class_val.id) || []);
        setAppointData({
            teacher_ids: Array.from(activeTeachers),
            class_ids: Array.from(activeClasses)
        });
        setIsAppointModalOpen(true);
    };

    const handleCheckboxChange = (type: 'teacher_ids' | 'class_ids', id: number) => {
        setAppointData(prev => {
            const current = prev[type];
            const updated = current.includes(id)
                ? current.filter(item => item !== id)
                : [...current, id];
            return { ...prev, [type]: updated };
        });
    };

    const handleAssign = async () => {
        if (!selectedSubject) return;

        try {
            const res = await api.put<{ message: string, created_count: number, deleted_count: number }>('/admin/teacher-subjects/sync', {
                context: 'subject',
                context_id: selectedSubject.id,
                teacher_ids: appointData.teacher_ids,
                subject_ids: [selectedSubject.id],
                class_ids: appointData.class_ids
            });
            showSuccess(res.message);
            setIsAppointModalOpen(false);
            fetchData(false);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка назначения');
        }
    };

    const handleUnassign = async (assignmentId: number) => {
        if (!confirm('Снять это назначение?')) return;

        try {
            await api.del(`/admin/teacher-subjects/${assignmentId}`);
            showSuccess('Назначение удалено');
            fetchData(false);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка удаления');
        }
    };

    const formatTeacherName = (t: Teacher) => {
        return [t.last_name, t.first_name, t.patronymic].filter(Boolean).join(' ') || t.login;
    };

    const processedSubjects = subjects.filter(s => {
        if (!searchQuery) return true;
        return s.name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    return (
        <div className={styles.card}>
            <div className={styles.sectionHeader} style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2>Список предметов</h2>
                    <span className={styles.usersCount}>{processedSubjects.length}</span>
                </div>
                <button className={styles.btnPrimary} onClick={() => handleOpenModal()}>
                    + Добавить предмет
                </button>
            </div>

            <div className={styles.searchBar} style={{ marginBottom: '24px' }}>
                <div className={styles.searchInputWrapper}>
                    <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Поиск предмета..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th style={{ width: '80px' }}>ID</th>
                            <th>Название</th>
                            <th>Назначенные учителя и классы</th>
                            <th style={{ width: '150px' }}>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} className={styles.empty}>Загрузка...</td></tr>
                        ) : processedSubjects.length === 0 ? (
                            <tr><td colSpan={4} className={styles.empty}>Предметы не найдены</td></tr>
                        ) : (
                            processedSubjects.map(subject => (
                                <tr key={subject.id}>
                                    <td>{subject.id}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                            <span>{subject.name}</span>
                                            {subject.category === 'profile' && (
                                                <span className={styles.badge} style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', padding: '2px 8px', fontSize: '0.7rem' }}>
                                                    Профильный
                                                </span>
                                            )}
                                            {subject.category === 'minor' && (
                                                <span className={styles.badge} style={{ background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', padding: '2px 8px', fontSize: '0.7rem' }}>
                                                    Второстепенный
                                                </span>
                                            )}
                                            {subject.is_profile_track && (
                                                <span className={styles.badge} style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9', padding: '2px 8px', fontSize: '0.7rem' }}>
                                                    10-11 ×{(subject.profile_weight ?? 1).toFixed(1)}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {subject.assignments && subject.assignments.length > 0 ? (
                                                subject.assignments.map(a => (
                                                    <span key={a.id} className={styles.badge} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', padding: '4px 8px' }}>
                                                        {a.teacher.name} - {a.class_val.name}
                                                        <button
                                                            onClick={() => handleUnassign(a.id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', padding: 0, display: 'flex' }}
                                                            title="Удалить назначение"
                                                        >
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                                        </button>
                                                    </span>
                                                ))
                                            ) : (
                                                <span className={styles.labelMuted}>Нет назначений</span>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button
                                                className={styles.actionBtn}
                                                onClick={() => handleOpenAppointModal(subject)}
                                                title="Назначить учителей"
                                            >
                                                + Назначить
                                            </button>
                                            <button
                                                className={styles.actionBtn}
                                                onClick={() => handleOpenModal(subject)}
                                                title="Редактировать предмет"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className={`${styles.actionBtn} ${styles.danger}`}
                                                onClick={() => handleDelete(subject.id)}
                                                title="Удалить предмет"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingSubject ? 'Редактировать предмет' : 'Новый предмет'}
            >
                <div className={styles.modalBody}>
                    <div className={styles.formGroup}>
                        <label>Название предмета</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Например: Математика"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Короткое имя (для журнала)</label>
                        <input
                            type="text"
                            value={formData.short_name}
                            onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
                            placeholder="Мат."
                            maxLength={20}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div className={styles.formGroup}>
                            <label>Категория предмета</label>
                            <select
                                value={formData.category}
                                onChange={(e) => setFormData({ ...formData, category: e.target.value as 'profile' | 'normal' | 'minor' })}
                            >
                                <option value="normal">Обычный (×1.0)</option>
                                <option value="profile">Профильный (×1.3)</option>
                                <option value="minor">Второстепенный (×0.5)</option>
                            </select>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                Применяется к ливкам только в профильных классах
                            </span>
                        </div>
                        <div className={styles.formGroup}>
                            <label>Доп. коэффициент (profile_weight)</label>
                            <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                max="3"
                                value={formData.profile_weight}
                                onChange={(e) => setFormData({ ...formData, profile_weight: Number(e.target.value) })}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                Бонус для 10-11 профильных, если &laquo;предмет профиля&raquo; включён
                            </span>
                        </div>
                    </div>

                    <div className={styles.formGroup} style={{ marginTop: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={formData.is_profile_track}
                                onChange={(e) => setFormData({ ...formData, is_profile_track: e.target.checked })}
                            />
                            <span>Профильный предмет (10-11 классы)</span>
                        </label>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '24px', display: 'block' }}>
                            Если включён — для учеников профильных классов profile_weight будет применяться к ливкам
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: 12 }}>
                        <div className={styles.formGroup}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.in_exchange}
                                    onChange={(e) => setFormData({ ...formData, in_exchange: e.target.checked })}
                                />
                                <span>Доступен на бирже</span>
                            </label>
                        </div>
                        <div className={styles.formGroup}>
                            <label>Коэффициент биржи</label>
                            <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                max="5"
                                value={formData.exchange_coefficient}
                                onChange={(e) => setFormData({ ...formData, exchange_coefficient: Number(e.target.value) })}
                                disabled={!formData.in_exchange}
                            />
                        </div>
                    </div>

                    <div className={styles.registerActions} style={{ marginTop: '24px' }}>
                        <button className={styles.btnSecondary} onClick={() => setIsModalOpen(false)}>
                            Отмена
                        </button>
                        <button className={styles.btnPrimary} onClick={handleSave}>
                            Сохранить
                        </button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={isAppointModalOpen}
                onClose={() => setIsAppointModalOpen(false)}
                title={`Назначить учителей и классы: ${selectedSubject ? selectedSubject.name : ''}`}
            >
                <div className={styles.modalBody}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

                        {/* Teachers Column */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                Выберите учителей ({appointData.teacher_ids.length})
                            </label>
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', overflowY: 'auto', maxHeight: '400px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-card)' }}>
                                {teachers.map(t => (
                                    <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '6px', borderRadius: '8px', transition: 'background 0.2s', background: appointData.teacher_ids.includes(t.id) ? 'var(--bg-input)' : 'transparent' }}>
                                        <input
                                            type="checkbox"
                                            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent)' }}
                                            checked={appointData.teacher_ids.includes(t.id)}
                                            onChange={() => handleCheckboxChange('teacher_ids', t.id)}
                                        />
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{formatTeacherName(t)}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Classes Column */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                Выберите классы ({appointData.class_ids.length})
                            </label>
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', overflowY: 'auto', maxHeight: '400px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-card)' }}>
                                {classes.map(c => (
                                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '6px', borderRadius: '8px', transition: 'background 0.2s', background: appointData.class_ids.includes(c.id) ? 'var(--bg-input)' : 'transparent' }}>
                                        <input
                                            type="checkbox"
                                            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent)' }}
                                            checked={appointData.class_ids.includes(c.id)}
                                            onChange={() => handleCheckboxChange('class_ids', c.id)}
                                        />
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{c.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                    </div>
                    <div className={styles.registerActions} style={{ marginTop: '24px' }}>
                        <button className={styles.btnSecondary} onClick={() => setIsAppointModalOpen(false)}>
                            Отмена
                        </button>
                        <button
                            className={styles.btnPrimary}
                            onClick={handleAssign}
                        >
                            Сохранить изменения
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
