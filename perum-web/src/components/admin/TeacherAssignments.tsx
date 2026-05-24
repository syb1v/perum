
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import styles from '@/app/admin/page.module.css';
import Modal from '@/components/ui/Modal';
import TeacherScheduleModal from '@/components/admin/modals/TeacherScheduleModal';
import { User, Subject } from '@/types';

// Types extension for this component
interface Class {
    id: number;
    name: string;
}

interface TeacherAssignment {
    id: number;
    subject: { id: number; name: string };
    class_val: { id: number; name: string }; // 'class' is reserved keyword, API likely returns 'class' but we map it or use as is
}

interface TeacherWithSubjects extends User {
    assignments: TeacherAssignment[];
}

export default function TeacherAssignments() {
    const { showSuccess, showError } = useToast();
    const [teachers, setTeachers] = useState<TeacherWithSubjects[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [classes, setClasses] = useState<Class[]>([]);
    const [loading, setLoading] = useState(false);

    // Modal state
    const [isAppointModalOpen, setIsAppointModalOpen] = useState(false);
    const [selectedTeacher, setSelectedTeacher] = useState<TeacherWithSubjects | null>(null);
    const [appointData, setAppointData] = useState<{ subject_ids: number[], class_ids: number[] }>({ subject_ids: [], class_ids: [] });

    // Schedule modal
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [scheduleTeacher, setScheduleTeacher] = useState<TeacherWithSubjects | null>(null);

    // Filter
    const [searchQuery, setSearchQuery] = useState('');

    const fetchData = useCallback(async (showLoader = true) => {
        if (showLoader) setLoading(true);
        try {
            const [teachersRes, subjectsRes, classesRes] = await Promise.all([
                api.get<{ teachers: TeacherWithSubjects[] }>('/admin/teachers'),
                api.get<{ subjects: Subject[] }>('/admin/subjects'),
                api.get<{ classes: Class[] }>('/admin/classes')
            ]);

            setTeachers(teachersRes.teachers);
            setSubjects(subjectsRes.subjects);
            setClasses(classesRes.classes);
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

    const handleOpenAppointModal = (teacher: TeacherWithSubjects) => {
        setSelectedTeacher(teacher);
        const activeSubjects = new Set(teacher.assignments?.map(a => a.subject.id) || []);
        const activeClasses = new Set(teacher.assignments?.map(a => a.class_val.id) || []);
        setAppointData({
            subject_ids: Array.from(activeSubjects),
            class_ids: Array.from(activeClasses)
        });
        setIsAppointModalOpen(true);
    };

    const handleCheckboxChange = (type: 'subject_ids' | 'class_ids', id: number) => {
        setAppointData(prev => {
            const current = prev[type];
            const updated = current.includes(id)
                ? current.filter(item => item !== id)
                : [...current, id];
            return { ...prev, [type]: updated };
        });
    };

    const handleAssign = async () => {
        if (!selectedTeacher) return;

        try {
            const res = await api.put<{ message: string, created_count: number, deleted_count: number }>('/admin/teacher-subjects/sync', {
                context: 'teacher',
                context_id: selectedTeacher.id,
                teacher_ids: [selectedTeacher.id],
                subject_ids: appointData.subject_ids,
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

    const formatName = (u: User) => {
        return [u.last_name, u.first_name, u.patronymic].filter(Boolean).join(' ') || '—';
    };

    const processedTeachers = teachers.filter(t => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return t.login.toLowerCase().includes(q) || formatName(t).toLowerCase().includes(q);
    });

    return (
        <div className={styles.card}>
            <div className={styles.sectionHeader}>
                <h2>Назначение учителей</h2>
                <span className={styles.usersCount}>{processedTeachers.length}</span>
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
                        placeholder="Поиск по ФИО или логину..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>ФИО</th>
                            <th>Логин</th>
                            <th>Назначенные предметы и классы</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} className={styles.empty}>Загрузка...</td></tr>
                        ) : processedTeachers.length === 0 ? (
                            <tr><td colSpan={4} className={styles.empty}>Учителя не найдены</td></tr>
                        ) : (
                            processedTeachers.map(teacher => (
                                <tr key={teacher.id}>
                                    <td>{formatName(teacher)}</td>
                                    <td>{teacher.login}</td>
                                    <td>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {teacher.assignments && teacher.assignments.length > 0 ? (
                                                teacher.assignments.map(a => (
                                                    <span key={a.id} className={styles.badge} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', padding: '4px 8px' }}>
                                                        {a.subject.name} - {a.class_val.name}
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
                                        <button
                                            className={styles.actionBtn}
                                            onClick={() => {
                                                setScheduleTeacher(teacher);
                                                setIsScheduleModalOpen(true);
                                            }}
                                            title="Расписание учителя"
                                        >
                                            📅 Расписание
                                        </button>
                                        <button
                                            className={styles.actionBtn}
                                            onClick={() => handleOpenAppointModal(teacher)}
                                            style={{ marginLeft: '6px' }}
                                            title="Назначить предметы"
                                        >
                                            + Назначить
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Modal
                isOpen={isAppointModalOpen}
                onClose={() => setIsAppointModalOpen(false)}
                title={`Назначить предметы и классы: ${selectedTeacher ? formatName(selectedTeacher) : ''}`}
            >
                <div className={styles.modalBody}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

                        {/* Subjects Column */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                Выберите предметы ({appointData.subject_ids.length})
                            </label>
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', overflowY: 'auto', maxHeight: '400px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-card)' }}>
                                {subjects.map(s => (
                                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '6px', borderRadius: '8px', transition: 'background 0.2s', background: appointData.subject_ids.includes(s.id) ? 'var(--bg-input)' : 'transparent' }}>
                                        <input
                                            type="checkbox"
                                            style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent)' }}
                                            checked={appointData.subject_ids.includes(s.id)}
                                            onChange={() => handleCheckboxChange('subject_ids', s.id)}
                                        />
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{s.name}</span>
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

            <TeacherScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={() => setIsScheduleModalOpen(false)}
                teacherId={scheduleTeacher?.id ?? null}
                teacherName={scheduleTeacher ? formatName(scheduleTeacher) : ''}
            />
        </div>
    );
}
