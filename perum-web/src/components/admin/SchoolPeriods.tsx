import { useState, useEffect } from 'react';
import styles from '@/app/admin/page.module.css';
import api from '@/lib/apiClient';
import { AcademicYear } from '@/types';

interface SchoolPeriod {
    id: number;
    name: string;
    period_type: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
    academic_year_id?: number | null;
    target_grades?: string | null;
}

export default function SchoolPeriods() {
    const [periods, setPeriods] = useState<SchoolPeriod[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState<number | null>(null);
    const [error, setError] = useState('');

    // Form state
    const [name, setName] = useState('');
    const [periodType, setPeriodType] = useState('quarter');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
    const [academicYearId, setAcademicYearId] = useState<number | ''>('');
    const [targetGrades, setTargetGrades] = useState<number[]>([]);

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const [periodsRes, yearsRes] = await Promise.all([
                api.get<{ periods: SchoolPeriod[] }>('/admin/school-periods'),
                api.get<{ academic_years: AcademicYear[] }>('/admin/academic-years')
            ]);
            setPeriods(periodsRes.periods);
            setAcademicYears(yearsRes.academic_years);
            setError('');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при загрузке данных');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const payload = {
                name,
                period_type: periodType,
                start_date: new Date(startDate).toISOString(),
                end_date: new Date(endDate).toISOString(),
                is_active: isActive,
                academic_year_id: academicYearId || null,
                target_grades: targetGrades.length > 0 ? JSON.stringify(targetGrades) : null
            };

            if (isEditing) {
                await api.put(`/admin/school-periods/${isEditing}`, payload);
            } else {
                await api.post('/admin/school-periods', payload);
            }

            resetForm();
            fetchData();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при сохранении периода');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Вы уверены, что хотите удалить этот период?')) return;
        try {
            await api.del(`/admin/school-periods/${id}`);
            fetchData();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при удалении');
        }
    };

    const editPeriod = (period: SchoolPeriod) => {
        setIsEditing(period.id);
        setName(period.name);
        setPeriodType(period.period_type);
        setStartDate(period.start_date.split('T')[0]);
        setEndDate(period.end_date.split('T')[0]);
        setIsActive(period.is_active);
        setAcademicYearId(period.academic_year_id || '');
        if (period.target_grades) {
            try { setTargetGrades(JSON.parse(period.target_grades)); } catch { setTargetGrades([]); }
        } else {
            setTargetGrades([]);
        }
    };

    const resetForm = () => {
        setIsEditing(null);
        setName('');
        setPeriodType('quarter');
        setStartDate('');
        setEndDate('');
        setIsActive(true);
        setAcademicYearId('');
        setTargetGrades([]);
    };

    const toggleGrade = (grade: number) => {
        setTargetGrades(prev =>
            prev.includes(grade) ? prev.filter(g => g !== grade) : [...prev, grade].sort((a, b) => a - b)
        );
    };

    if (isLoading) return <div className={styles.loading}>Загрузка...</div>;

    return (
        <div className={styles.managementSection}>
            <div className={styles.card}>
                <h2 className={styles.cardTitle}>{isEditing ? 'Редактировать период' : 'Добавить учебный период'}</h2>

                {error && <div className={styles.errorBanner}>{error}</div>}

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Название (напр. 1 Четверть)</label>
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
                            <label className={styles.label}>Учебный год</label>
                            <select
                                value={academicYearId}
                                onChange={(e) => setAcademicYearId(e.target.value ? Number(e.target.value) : '')}
                                className={styles.select}
                            >
                                <option value="">Сквозной (не привязан к году)</option>
                                {academicYears.map(ay => (
                                    <option key={ay.id} value={ay.id}>{ay.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Тип периода</label>
                            <select
                                value={periodType}
                                onChange={(e) => setPeriodType(e.target.value)}
                                className={styles.select}
                            >
                                <option value="quarter">Четверть</option>
                                <option value="half_year">Полугодие</option>
                                <option value="holiday">Каникулы</option>
                                <option value="vacation">Праздник/Выходной</option>
                            </select>
                        </div>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Применяется к классам (пусто = ко всем)</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(g => (
                                <button
                                    type="button"
                                    key={g}
                                    onClick={() => toggleGrade(g)}
                                    style={{
                                        padding: '4px 12px',
                                        borderRadius: '16px',
                                        border: targetGrades.includes(g) ? '1px solid #3b82f6' : '1px solid #e5e7eb',
                                        background: targetGrades.includes(g) ? '#eff6ff' : 'white',
                                        color: targetGrades.includes(g) ? '#2563eb' : '#4b5563',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {g} класс
                                </button>
                            ))}
                        </div>
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
                                id="isActive"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                            />
                            <label htmlFor="isActive">Активен (учитывается в аналитике)</label>
                        </div>
                    </div>

                    <div className={styles.formActions}>
                        {isEditing && (
                            <button type="button" onClick={resetForm} className={styles.cancelBtn}>
                                Отмена
                            </button>
                        )}
                        <button type="submit" className={styles.submitBtn}>
                            {isEditing ? 'Сохранить изменения' : 'Добавить период'}
                        </button>
                    </div>
                </form>
            </div >

            <div className={styles.card}>
                <h2 className={styles.cardTitle}>Список учебных периодов</h2>

                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Название</th>
                                <th>Тип</th>
                                <th>Начало</th>
                                <th>Конец</th>
                                <th>Статус</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {periods.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className={styles.emptyState}>
                                        Учебные периоды не найдены
                                    </td>
                                </tr>
                            ) : (
                                periods.map((period) => (
                                    <tr key={period.id}>
                                        <td>{period.name}</td>
                                        <td>
                                            {period.period_type === 'quarter' && 'Четверть'}
                                            {period.period_type === 'half_year' && 'Полугодие'}
                                            {period.period_type === 'holiday' && 'Каникулы'}
                                            {period.period_type === 'vacation' && 'Праздник'}
                                            {period.target_grades ? (
                                                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                                                    Кл: {JSON.parse(period.target_grades).join(', ')}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td>{new Date(period.start_date).toLocaleDateString()}</td>
                                        <td>{new Date(period.end_date).toLocaleDateString()}</td>
                                        <td>
                                            <span className={period.is_active ? styles.statusActive : styles.statusInactive}>
                                                {period.is_active ? 'Активен' : 'Неактивен'}
                                            </span>
                                        </td>
                                        <td className={styles.actionsCell}>
                                            <button
                                                onClick={() => editPeriod(period)}
                                                className={styles.actionBtn}
                                                title="Редактировать"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={() => handleDelete(period.id)}
                                                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                title="Удалить"
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
        </div >
    );
}
