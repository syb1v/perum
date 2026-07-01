
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import styles from '@/app/admin/page.module.css';
import Modal from '@/components/ui/Modal';
import ClassStudentsModal from './modals/ClassStudentsModal';
import ClassScheduleModal from './modals/ClassScheduleModal';
import { BellSchedule } from '@/types';

interface ClassData {
    id: number;
    name: string;
    student_count: number;
    teacher: {
        id: number;
        name: string; // "Last First"
    } | null;
    bell_schedule_id?: number | null;
    parent_id?: number | null;
    grade_level?: number | null;
    is_profile?: number | boolean;
}

interface TeacherOption {
    id: number;
    last_name: string;
    first_name: string;
    patronymic?: string;
}

export default function ClassManagement() {
    const { showSuccess, showError } = useToast();
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [teachers, setTeachers] = useState<TeacherOption[]>([]);
    const [bellSchedules, setBellSchedules] = useState<BellSchedule[]>([]);
    const [loading, setLoading] = useState(false);

    // Modal state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isStudentsModalOpen, setIsStudentsModalOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);

    // Filters and Sorting
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'student_count'>('name');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const [formData, setFormData] = useState({ name: '', teacher_id: '', bell_schedule_id: '', parent_id: '', grade_level: '', is_profile: false });

    const fetchData = useCallback(async (showLoader = true) => {
        if (showLoader) setLoading(true);
        try {
            const [classesRes, teachersRes, bellSchedulesRes] = await Promise.all([
                api.get<{ classes: ClassData[] }>('/admin/classes'),
                api.get<{ teachers: TeacherOption[] }>('/admin/teachers'),
                api.get<{ success: boolean; data: BellSchedule[] }>('/admin/bell-schedules')
            ]);
            setClasses(classesRes.classes);
            setTeachers(teachersRes.teachers);
            if (bellSchedulesRes.success) {
                setBellSchedules(bellSchedulesRes.data);
            }
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

    const handleOpenEditModal = (cls: ClassData | null = null) => {
        setSelectedClass(cls);
        setFormData({
            name: cls ? cls.name : '',
            teacher_id: cls?.teacher ? cls.teacher.id.toString() : '',
            bell_schedule_id: cls?.bell_schedule_id ? cls.bell_schedule_id.toString() : '',
            parent_id: cls?.parent_id ? cls.parent_id.toString() : '',
            grade_level: cls?.grade_level != null ? String(cls.grade_level) : '',
            is_profile: !!cls?.is_profile,
        });
        setIsEditModalOpen(true);
    };

    const handleOpenStudentsModal = (cls: ClassData) => {
        setSelectedClass(cls);
        setIsStudentsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) {
            showError('Введите название класса');
            return;
        }

        const classPattern = /^(1[01]?|[1-9])[А-Яа-яA-Za-z]?$/;
        if (!classPattern.test(formData.name)) {
            showError('Неверный формат. Примеры: 1А, 5Б, 10В, 11Г');
            return;
        }

        try {
            const payload: Record<string, string | number | boolean | null> = { name: formData.name };
            payload.teacher_id = formData.teacher_id ? parseInt(formData.teacher_id) : 0;
            payload.bell_schedule_id = formData.bell_schedule_id ? parseInt(formData.bell_schedule_id) : 0;
            payload.parent_id = formData.parent_id ? parseInt(formData.parent_id) : 0;
            payload.grade_level = formData.grade_level ? parseInt(formData.grade_level) : null;
            payload.is_profile = formData.is_profile ? 1 : 0;

            if (selectedClass) {
                await api.put(`/admin/classes/${selectedClass.id}`, payload);
                showSuccess('Класс обновлен');
            } else {
                await api.post('/admin/classes', payload);
                showSuccess('Класс сохранен');
            }
            setIsEditModalOpen(false);
            fetchData(false);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка сохранения');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Вы уверены, что хотите удалить этот класс?')) return;

        try {
            await api.del(`/admin/classes/${id}`);
            showSuccess('Класс удален');
            fetchData(false);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка удаления');
        }
    };

    const formatTeacherName = (t: TeacherOption) => {
        return [t.last_name, t.first_name, t.patronymic].filter(Boolean).join(' ');
    };

    // Apply filtering and sorting
    const processedClasses = classes
        .filter(cls => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            const teacherName = cls.teacher ? cls.teacher.name.toLowerCase() : '';
            return cls.name.toLowerCase().includes(q) || teacherName.includes(q);
        })
        .sort((a, b) => {
            let res = 0;
            if (sortBy === 'name') {
                res = a.name.localeCompare(b.name, 'ru', { numeric: true });
            } else if (sortBy === 'student_count') {
                res = a.student_count - b.student_count;
            }
            return sortOrder === 'asc' ? res : -res;
        });

    // Отрисовка дерева: только для сортировки "по названию" (по умолчанию)
    const renderClassesTree = () => {
        if (sortBy !== 'name' || searchQuery) return processedClasses; // если поиск или другая сортировка - плоский список

        const tree: ClassData[] = [];
        const topLevel = processedClasses.filter(c => !c.parent_id);

        topLevel.forEach(parent => {
            tree.push(parent);
            const children = processedClasses.filter(c => c.parent_id === parent.id);
            tree.push(...children);
        });

        // Добавляем детей-сирот (если родитель почему-то не найден в topLevel)
        const inTree = new Set(tree.map(c => c.id));
        const orphans = processedClasses.filter(c => !inTree.has(c.id));
        tree.push(...orphans);

        return tree;
    };

    const displayClasses = renderClassesTree();

    return (
        <div className={styles.card}>
            <div className={styles.sectionHeader} style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2>Список классов</h2>
                    <span className={styles.usersCount}>{processedClasses.length}</span>
                </div>
                <button className={styles.btnPrimary} onClick={() => handleOpenEditModal()}>
                    + Создать класс
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
                        placeholder="Поиск класса или учителя..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className={styles.roleFilter} style={{ display: 'flex', gap: '8px' }}>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'name' | 'student_count')}>
                        <option value="name">По названию</option>
                        <option value="student_count">По количеству учеников</option>
                    </select>
                    <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}>
                        <option value="asc">По возрастанию</option>
                        <option value="desc">По убыванию</option>
                    </select>
                </div>
            </div>

            <div className={styles.grid}>
                {loading ? (
                    <p className={styles.empty}>Загрузка...</p>
                ) : displayClasses.length === 0 ? (
                    <p className={styles.empty}>Классы не найдены</p>
                ) : (
                    displayClasses.map(cls => (
                        <div key={cls.id} className={styles.card} style={{ marginBottom: 0, marginLeft: cls.parent_id && !searchQuery && sortBy === 'name' ? '24px' : '0', borderLeft: cls.parent_id && !searchQuery && sortBy === 'name' ? '4px solid var(--primary-color)' : 'none' }}>
                            <div className={styles.sectionHeader} style={{ justifyContent: 'space-between', marginBottom: '8px' }}>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                                    {cls.parent_id && !searchQuery && sortBy === 'name' && <span style={{ color: 'var(--text-secondary)', marginRight: '8px' }}>↳</span>}
                                    {cls.name}
                                </h3>
                                <span className={styles.usersCount}>{cls.student_count} уч.</span>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '16px' }}>
                                {cls.teacher ? cls.teacher.name : 'Руководитель не назначен'}
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                <button
                                    className={styles.actionBtn}
                                    onClick={() => handleOpenStudentsModal(cls)}
                                >
                                    Ученики
                                </button>
                                <button
                                    className={styles.actionBtn}
                                    onClick={() => {
                                        setSelectedClass(cls);
                                        setIsScheduleModalOpen(true);
                                    }}
                                >
                                    Расписание
                                </button>
                                <button
                                    className={styles.actionBtn}
                                    onClick={() => handleOpenEditModal(cls)}
                                >
                                    Ред.
                                </button>
                                <button
                                    className={`${styles.actionBtn} ${styles.danger}`}
                                    onClick={() => handleDelete(cls.id)}
                                >
                                    Удал.
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <Modal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                title={selectedClass ? 'Редактировать класс' : 'Новый класс'}
            >
                <div className={styles.modalBody}>
                    <div className={styles.formGroup}>
                        <label>Название класса</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Например: 10А"
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label>Классный руководитель</label>
                        <select
                            value={formData.teacher_id}
                            onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
                        >
                            <option value="">Не назначен</option>
                            {teachers.map(t => (
                                <option key={t.id} value={t.id}>{formatTeacherName(t)}</option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.formGroup}>
                        <label>Расписание звонков</label>
                        <select
                            value={formData.bell_schedule_id}
                            onChange={(e) => setFormData({ ...formData, bell_schedule_id: e.target.value })}
                        >
                            <option value="">Не назначено</option>
                            {bellSchedules.map(bs => (
                                <option key={bs.id} value={bs.id}>{bs.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div className={styles.formGroup}>
                            <label>Параллель (1-11)</label>
                            <input
                                type="number"
                                min="1"
                                max="11"
                                value={formData.grade_level}
                                onChange={(e) => setFormData({ ...formData, grade_level: e.target.value })}
                                placeholder="например, 10"
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Используется в рейтингах, миграции, профильности
                            </span>
                        </div>
                        <div className={styles.formGroup}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 24 }}>
                                <input
                                    type="checkbox"
                                    checked={formData.is_profile}
                                    onChange={(e) => setFormData({ ...formData, is_profile: e.target.checked })}
                                />
                                <span>Профильный класс (10-11)</span>
                            </label>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 24, display: 'block' }}>
                                Применяется profile_weight профильных предметов
                            </span>
                        </div>
                    </div>

                    <div className={styles.registerActions} style={{ marginTop: '24px' }}>
                        <button className={styles.btnSecondary} onClick={() => setIsEditModalOpen(false)}>
                            Отмена
                        </button>
                        <button className={styles.btnPrimary} onClick={handleSave}>
                            Сохранить
                        </button>
                    </div>
                </div>
            </Modal>

            <ClassStudentsModal
                isOpen={isStudentsModalOpen}
                onClose={() => setIsStudentsModalOpen(false)}
                classId={selectedClass?.id || null}
                classNameStr={selectedClass?.name || ''}
            />
            <ClassScheduleModal
                isOpen={isScheduleModalOpen}
                onClose={() => setIsScheduleModalOpen(false)}
                classId={selectedClass?.id || null}
                classNameStr={selectedClass?.name || ''}
            />
        </div>
    );
}
