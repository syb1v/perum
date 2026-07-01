import { useState, useEffect } from 'react';
import styles from '@/app/admin/page.module.css';
import api from '@/lib/apiClient';
import { AcademicYear } from '@/types';

export default function AcademicYearSection() {
    const [years, setYears] = useState<AcademicYear[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<number | null>(null);
    const [error, setError] = useState('');

    // Form state
    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isCurrent, setIsCurrent] = useState(false);

    const fetchYears = async () => {
        try {
            setIsLoading(true);
            const response = await api.get<{ academic_years: AcademicYear[] }>('/admin/academic-years');
            setYears(response.academic_years);
            setError('');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при загрузке учебных годов');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchYears();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                name,
                start_date: new Date(startDate).toISOString(),
                end_date: new Date(endDate).toISOString(),
                is_current: isCurrent
            };

            if (isEditing) {
                await api.put(`/admin/academic-years/${isEditing}`, payload);
            } else {
                await api.post('/admin/academic-years', payload);
            }

            resetForm();
            fetchYears();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при сохранении');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Вы уверены, что хотите удалить этот учебный год?')) return;
        try {
            await api.del(`/admin/academic-years/${id}`);
            fetchYears();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при удалении');
        }
    };

    const handleSetCurrent = async (id: number) => {
        try {
            await api.put(`/admin/academic-years/${id}`, { is_current: true });
            fetchYears();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при установке текущего года');
        }
    };

    const editYear = (year: AcademicYear) => {
        setIsEditing(year.id);
        setName(year.name);
        setStartDate(year.start_date.split('T')[0]);
        setEndDate(year.end_date.split('T')[0]);
        setIsCurrent(year.is_current);
    };

    const resetForm = () => {
        setIsEditing(null);
        setName('');
        setStartDate('');
        setEndDate('');
        setIsCurrent(false);
    };

    if (isLoading) return <div className={styles.loading}>Загрузка...</div>;

    return (
        <div className={styles.managementSection}>
            <div className={styles.card}>
                <h2 className={styles.cardTitle}>{isEditing ? 'Редактировать учебный год' : 'Добавить учебный год'}</h2>

                {error && <div className={styles.errorBanner}>{error}</div>}

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Название (напр. 2025-2026)</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={styles.input}
                            required
                        />
                    </div>

                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Дата начала</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className={styles.input}
                                required
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Дата окончания</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className={styles.input}
                                required
                            />
                        </div>
                    </div>

                    <div className={styles.checkboxGroup}>
                        <div className={styles.customCheckbox}>
                            <input
                                type="checkbox"
                                id="isCurrent"
                                checked={isCurrent}
                                onChange={(e) => setIsCurrent(e.target.checked)}
                            />
                            <label htmlFor="isCurrent">Сделать текущим учебным годом</label>
                        </div>
                    </div>

                    <div className={styles.formActions}>
                        {isEditing && (
                            <button type="button" onClick={resetForm} className={styles.cancelBtn}>
                                Отмена
                            </button>
                        )}
                        <button type="submit" className={styles.submitBtn}>
                            {isEditing ? 'Сохранить изменения' : 'Добавить год'}
                        </button>
                    </div>
                </form>
            </div>

            <div className={styles.card}>
                <h2 className={styles.cardTitle}>Список учебных годов</h2>

                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Название</th>
                                <th>Начало</th>
                                <th>Конец</th>
                                <th>Статус</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {years.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className={styles.emptyState}>
                                        Учебные года не найдены
                                    </td>
                                </tr>
                            ) : (
                                years.map((year) => (
                                    <tr key={year.id} style={{ background: year.is_current ? 'rgba(16, 185, 129, 0.05)' : '' }}>
                                        <td style={{ fontWeight: year.is_current ? 'bold' : 'normal' }}>{year.name}</td>
                                        <td>{new Date(year.start_date).toLocaleDateString()}</td>
                                        <td>{new Date(year.end_date).toLocaleDateString()}</td>
                                        <td>
                                            {year.is_current ? (
                                                <span className={styles.statusActive}>Текущий</span>
                                            ) : (
                                                <button onClick={() => handleSetCurrent(year.id)} className={styles.actionBtn} style={{ color: '#3b82f6', fontSize: '13px' }}>
                                                    Сделать текущим
                                                </button>
                                            )}
                                        </td>
                                        <td className={styles.actionsCell}>
                                            <button
                                                onClick={() => editYear(year)}
                                                className={styles.actionBtn}
                                                title="Редактировать"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={() => handleDelete(year.id)}
                                                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                title="Удалить"
                                                disabled={year.is_current}
                                                style={{ opacity: year.is_current ? 0.5 : 1 }}
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
