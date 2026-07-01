import { useState, useEffect } from 'react';
import styles from '@/app/admin/page.module.css';
import api from '@/lib/apiClient';

interface SchoolSettings {
    dot_to_two_days: number;
    min_grade_weight: number;
    max_grade_weight: number;
    min_grades_for_attestation: number;
    grade_5_min: number;
    grade_4_min: number;
    grade_3_min: number;
    binary_pass_min: number;
}

export default function SystemSettings() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Form state
    const [dotToTwoDays, setDotToTwoDays] = useState<number | ''>('');
    const [minGradeWeight, setMinGradeWeight] = useState<number | ''>('');
    const [maxGradeWeight, setMaxGradeWeight] = useState<number | ''>('');

    // Attestation state
    const [minGrades, setMinGrades] = useState<number | ''>('');
    const [grade5Min, setGrade5Min] = useState<number | ''>('');
    const [grade4Min, setGrade4Min] = useState<number | ''>('');
    const [grade3Min, setGrade3Min] = useState<number | ''>('');
    const [binaryPassMin, setBinaryPassMin] = useState<number | ''>('');

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const res = await api.get<{ success: boolean; data: SchoolSettings }>('/admin/school-settings');
            const data = res.data;
            setDotToTwoDays(data.dot_to_two_days || '');
            setMinGradeWeight(data.min_grade_weight || '');
            setMaxGradeWeight(data.max_grade_weight || '');
            setMinGrades(data.min_grades_for_attestation || '');
            setGrade5Min(data.grade_5_min || '');
            setGrade4Min(data.grade_4_min || '');
            setGrade3Min(data.grade_3_min || '');
            setBinaryPassMin(data.binary_pass_min || '');
            setError('');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при загрузке настроек');
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
            setIsSaving(true);
            setSuccessMsg('');

            await api.put('/admin/school-settings', {
                dot_to_two_days: dotToTwoDays === '' ? null : Number(dotToTwoDays),
                min_grade_weight: minGradeWeight === '' ? null : Number(minGradeWeight),
                max_grade_weight: maxGradeWeight === '' ? null : Number(maxGradeWeight),
                min_grades_for_attestation: minGrades === '' ? null : Number(minGrades),
                grade_5_min: grade5Min === '' ? null : Number(grade5Min),
                grade_4_min: grade4Min === '' ? null : Number(grade4Min),
                grade_3_min: grade3Min === '' ? null : Number(grade3Min),
                binary_pass_min: binaryPassMin === '' ? null : Number(binaryPassMin)
            });

            setSuccessMsg('Настройки успешно сохранены');
            fetchData();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при сохранении настроек');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div className={styles.loading}>Загрузка...</div>;

    return (
        <div className={styles.managementSection}>
            <div className={styles.card}>
                <h2 className={styles.cardTitle}>Системные настройки</h2>

                {error && <div className={styles.errorBanner}>{error}</div>}
                {successMsg && <div className={styles.successBanner} style={{ padding: '12px', background: '#ecfdf5', color: '#047857', borderRadius: '8px', marginBottom: '20px' }}>{successMsg}</div>}

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Дней до превращения точки в двойку</label>
                            <input
                                type="number"
                                value={dotToTwoDays}
                                onChange={(e) => setDotToTwoDays(e.target.value ? Number(e.target.value) : '')}
                                className={styles.input}
                                min="1"
                                max="365"
                                required
                            />
                            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>Автоматически меняет &quot;точку&quot; (опоздание сдачи/не готовность) на &quot;2&quot; через это количество дней</p>
                        </div>
                    </div>

                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginTop: '20px', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' }}>
                        Веса оценок
                    </h3>

                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Минимальный вес оценки</label>
                            <input
                                type="number"
                                value={minGradeWeight}
                                onChange={(e) => setMinGradeWeight(e.target.value ? Number(e.target.value) : '')}
                                className={styles.input}
                                min="0.1"
                                max="10.0"
                                step="0.1"
                                required
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Максимальный вес оценки</label>
                            <input
                                type="number"
                                value={maxGradeWeight}
                                onChange={(e) => setMaxGradeWeight(e.target.value ? Number(e.target.value) : '')}
                                className={styles.input}
                                min="0.1"
                                max="10.0"
                                step="0.1"
                                required
                            />
                        </div>
                    </div>

                    <h3 style={{ fontSize: '16px', fontWeight: 600, marginTop: '20px', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid #e5e7eb' }}>
                        Критерии выставления аттестационных оценок
                    </h3>

                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Минимальное количество оценок</label>
                            <input
                                type="number"
                                value={minGrades}
                                onChange={(e) => setMinGrades(e.target.value ? Number(e.target.value) : '')}
                                className={styles.input}
                                min="1"
                                max="20"
                                required
                            />
                            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>Для допуска к аттестации ученик должен иметь не менее этого числа оценок</p>
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Порог для &quot;Усвоил&quot; (бинарная система)</label>
                            <input
                                type="number"
                                value={binaryPassMin}
                                onChange={(e) => setBinaryPassMin(e.target.value ? Number(e.target.value) : '')}
                                className={styles.input}
                                min="0.0"
                                max="5.0"
                                step="0.01"
                                required
                            />
                        </div>
                    </div>

                    <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Порог для оценки &quot;5&quot;</label>
                            <input
                                type="number"
                                value={grade5Min}
                                onChange={(e) => setGrade5Min(e.target.value ? Number(e.target.value) : '')}
                                className={styles.input}
                                min="0.0"
                                max="5.0"
                                step="0.01"
                                required
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Порог для оценки &quot;4&quot;</label>
                            <input
                                type="number"
                                value={grade4Min}
                                onChange={(e) => setGrade4Min(e.target.value ? Number(e.target.value) : '')}
                                className={styles.input}
                                min="0.0"
                                max="5.0"
                                step="0.01"
                                required
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label className={styles.label}>Порог для оценки &quot;3&quot;</label>
                            <input
                                type="number"
                                value={grade3Min}
                                onChange={(e) => setGrade3Min(e.target.value ? Number(e.target.value) : '')}
                                className={styles.input}
                                min="0.0"
                                max="5.0"
                                step="0.01"
                                required
                            />
                        </div>
                    </div>

                    <div className={styles.formActions}>
                        <button type="submit" className={styles.submitBtn} disabled={isSaving}>
                            {isSaving ? 'Сохранение...' : 'Сохранить настройки'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
