import { useState } from 'react';
import styles from '../../app/teacher/journal/page.module.css';
import api from '@/lib/apiClient';
import type { JournalStudent, Subject, PeriodInfo } from '@/types';

interface FinalGradeModalProps {
    student: JournalStudent | null;
    subject: Subject | null;
    classId: number;
    period: PeriodInfo | null;
    existingGrade: { value: number; type: string; comment?: string } | null;
    recommendedGrade: number | null;
    onClose: () => void;
    onSave: () => void;
}

export default function FinalGradeModal({
    student,
    subject,
    classId,
    period,
    existingGrade,
    recommendedGrade,
    onClose,
    onSave
}: FinalGradeModalProps) {
    const [gradeValue, setGradeValue] = useState<number>(existingGrade?.value || (recommendedGrade ? Math.round(recommendedGrade) : 0));
    const [gradeType, setGradeType] = useState<string>(existingGrade?.type || 'quarter');
    const [comment, setComment] = useState(existingGrade?.comment || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!student || !subject || !period) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!gradeValue) {
            setError('Выберите оценку');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            await api.post(`/journal/grades/final/${classId}/${subject.id}`, {
                student_id: student.id,
                grade_value: gradeValue,
                period_id: period.id,
                grade_type: gradeType,
                comment: comment || null
            });
            onSave();
            onClose();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при выставлении итоговой оценки');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2 className={styles.modalTitle}>Итоговая оценка</h2>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div className={styles.studentInfo}>
                    <div className={styles.studentAvatar}>
                        {student.first_name[0]}{student.last_name[0]}
                    </div>
                    <div>
                        <div className={styles.studentName}>{student.last_name} {student.first_name}</div>
                        <div className={styles.subjectName}>{subject.name} • {period.name}</div>
                    </div>
                </div>

                {error && <div className={styles.errorText}>{error}</div>}

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Оценка</label>
                        <div className={styles.gradeButtons}>
                            {[5, 4, 3, 2, 1].map((g) => (
                                <button
                                    key={g}
                                    type="button"
                                    className={`${styles.gradeBtn} ${styles['grade' + g]} ${gradeValue === g ? styles.active : ''}`}
                                    onClick={() => setGradeValue(g)}
                                >
                                    {g}
                                </button>
                            ))}
                        </div>
                        {recommendedGrade !== null && (
                            <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                                Рекомендуемая оценка (средний балл): <strong style={{ color: 'var(--text-primary)' }}>{recommendedGrade.toFixed(2)}</strong>
                            </div>
                        )}
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Тип итога</label>
                        <select
                            className={styles.select}
                            value={gradeType}
                            onChange={(e) => setGradeType(e.target.value)}
                        >
                            <option value="quarter">За четверть</option>
                            <option value="half_year">За полугодие</option>
                            <option value="year">Годовая</option>
                        </select>
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>Комментарий (необязательно)</label>
                        <textarea
                            className={styles.textarea}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Например: За отличную работу в четверти"
                            rows={3}
                        />
                    </div>

                    <div className={styles.formActions}>
                        <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isSubmitting}>
                            Отмена
                        </button>
                        <button type="submit" className={styles.submitBtn} disabled={isSubmitting || !gradeValue}>
                            {isSubmitting ? 'Сохранение...' : 'Сохранить'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
