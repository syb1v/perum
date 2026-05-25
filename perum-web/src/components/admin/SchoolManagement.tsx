'use client';

import { useState, useEffect } from 'react';
import styles from '@/app/admin/page.module.css';
import api from '@/lib/apiClient';

interface School {
    id: number;
    name: string;
    is_active: boolean;
    students_count: number;
    teachers_count: number;
    classes_count: number;
}

/**
 * Управление школами организации (только для org_admin).
 * Создание/переименование/деактивация/удаление + «сделать текущей» (завязано на
 * переключатель школ в шапке через localStorage `current_school_id`).
 */
export default function SchoolManagement() {
    const [schools, setSchools] = useState<School[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const [isEditing, setIsEditing] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [isActive, setIsActive] = useState(true);

    const [currentId, setCurrentId] = useState<string>('');

    const fetchSchools = async () => {
        try {
            setIsLoading(true);
            const res = await api.get<{ schools: School[] }>('/admin/schools');
            setSchools(res.schools || []);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка при загрузке школ');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSchools();
        if (typeof window !== 'undefined') {
            setCurrentId(localStorage.getItem('current_school_id') || '');
        }
    }, []);

    const resetForm = () => {
        setIsEditing(null);
        setName('');
        setIsActive(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (isEditing) {
                await api.put(`/admin/schools/${isEditing}`, { name, is_active: isActive });
            } else {
                await api.post('/admin/schools', { name });
            }
            resetForm();
            fetchSchools();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка при сохранении');
        }
    };

    const editSchool = (s: School) => {
        setIsEditing(s.id);
        setName(s.name);
        setIsActive(s.is_active);
    };

    const handleDelete = async (s: School) => {
        if (!confirm(`Удалить школу «${s.name}»? Это возможно только если в ней нет пользователей и классов.`)) return;
        try {
            await api.del(`/admin/schools/${s.id}`);
            fetchSchools();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка при удалении');
        }
    };

    const makeCurrent = (s: School) => {
        localStorage.setItem('current_school_id', String(s.id));
        // Перезагружаем — переключатель и все экраны подхватят выбранную школу.
        window.location.reload();
    };

    if (isLoading) return <div className={styles.loading}>Загрузка...</div>;

    return (
        <div className={styles.managementSection}>
            <div className={styles.card}>
                <h2 className={styles.cardTitle}>{isEditing ? 'Редактировать школу' : 'Добавить школу'}</h2>
                {error && <div className={styles.errorBanner}>{error}</div>}

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Название школы</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={styles.input}
                            placeholder="Напр. Гимназия №5"
                            required
                        />
                    </div>

                    {isEditing && (
                        <div className={styles.checkboxGroup}>
                            <div className={styles.customCheckbox}>
                                <input
                                    type="checkbox"
                                    id="schoolActive"
                                    checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)}
                                />
                                <label htmlFor="schoolActive">Школа активна</label>
                            </div>
                        </div>
                    )}

                    <div className={styles.formActions}>
                        {isEditing && (
                            <button type="button" onClick={resetForm} className={styles.cancelBtn}>
                                Отмена
                            </button>
                        )}
                        <button type="submit" className={styles.submitBtn}>
                            {isEditing ? 'Сохранить изменения' : 'Добавить школу'}
                        </button>
                    </div>
                </form>
            </div>

            <div className={styles.card}>
                <h2 className={styles.cardTitle}>Школы организации</h2>
                <p style={{ color: '#64748b', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    «Текущая школа» определяет, под какой школой работают все разделы админки. Сменить её можно
                    здесь или в переключателе сверху.
                </p>

                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Название</th>
                                <th>Ученики</th>
                                <th>Учителя</th>
                                <th>Классы</th>
                                <th>Статус</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {schools.length === 0 ? (
                                <tr><td colSpan={6} className={styles.emptyState}>Школы не найдены</td></tr>
                            ) : (
                                schools.map((s) => {
                                    const isCurrent = String(s.id) === currentId;
                                    return (
                                        <tr key={s.id} style={{ background: isCurrent ? 'rgba(16, 185, 129, 0.05)' : '' }}>
                                            <td style={{ fontWeight: isCurrent ? 'bold' : 'normal' }}>
                                                {s.name}{isCurrent ? ' • текущая' : ''}
                                            </td>
                                            <td>{s.students_count}</td>
                                            <td>{s.teachers_count}</td>
                                            <td>{s.classes_count}</td>
                                            <td>
                                                {s.is_active
                                                    ? <span className={styles.statusActive}>Активна</span>
                                                    : <span style={{ color: '#ef4444' }}>Неактивна</span>}
                                            </td>
                                            <td className={styles.actionsCell}>
                                                {!isCurrent && (
                                                    <button onClick={() => makeCurrent(s)} className={styles.actionBtn} style={{ color: '#3b82f6', fontSize: '13px' }}>
                                                        Сделать текущей
                                                    </button>
                                                )}
                                                <button onClick={() => editSchool(s)} className={styles.actionBtn} title="Редактировать">✏️</button>
                                                <button
                                                    onClick={() => handleDelete(s)}
                                                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                    title="Удалить (только пустую школу)"
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
