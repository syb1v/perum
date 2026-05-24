'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/apiClient';
import { useToast } from '@/context/ToastContext';
import Modal from '@/components/ui/Modal';
import styles from '../../app/teacher/journal/page.module.css';
import type { JournalStudent, Subject, Topic, WorkType } from '@/types';

interface GradeModalProps {
    student: JournalStudent | null;
    subject: Subject | null;
    classId: number;
    date: string; // YYYY-MM-DD
    defaultWorkTypeId?: string;
    defaultTopicId?: string;
    onClose: () => void;
    onSave: () => void;
}



const ATTENDANCE_MARKS = [
    { value: 'УП', label: 'Уваж. причина', color: '#16a34a', bg: '#dcfce7' },
    { value: 'НП', label: 'Неуваж. причина', color: '#dc2626', bg: '#fee2e2' },
    { value: 'осв.', label: 'Освобождён', color: '#2563eb', bg: '#dbeafe' },
    { value: 'точка', label: 'Долг (Точка)', color: '#dc2626', bg: '#fee2e2', display: '•' },
];

export default function GradeModal({ student, subject, classId, date, defaultWorkTypeId, defaultTopicId, onClose, onSave }: GradeModalProps) {
    const { showError, showSuccess } = useToast();
    const [gradeValue, setGradeValue] = useState<number | null>(null);
    const [attendanceMark, setAttendanceMark] = useState<string | null>(null);
    const [gradeType, setGradeType] = useState(defaultWorkTypeId || 'ответ');
    const [topicId, setTopicId] = useState<string>(defaultTopicId || '');
    const [comment, setComment] = useState('');
    const [topics, setTopics] = useState<Topic[]>([]);
    const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Load WorkTypes
        api.get<{ success: boolean; work_types: WorkType[] }>('/journal/work-types')
            .then(data => {
                if (data.work_types && data.work_types.length > 0) {
                    setWorkTypes(data.work_types);
                    if (!defaultWorkTypeId) {
                        setGradeType(data.work_types[0].id.toString());
                    }
                }
            })
            .catch(err => console.error('Failed to load work types', err));
    }, [defaultWorkTypeId]);

    useEffect(() => {
        if (subject) {
            api.get<{ topics: Topic[] }>(`/journal/subjects/${subject.id}/topics`)
                .then(data => setTopics(data.topics || []))
                .catch(err => console.error('Failed to load topics', err));
        }
    }, [subject]);

    if (!student || !subject) return null;

    const handleGradeSelect = (g: number) => {
        setGradeValue(g);
        setAttendanceMark(null); // Сбрасываем пометку при выборе оценки
    };

    const handleAttendanceSelect = (mark: string) => {
        if (attendanceMark === mark) {
            setAttendanceMark(null); // Повторный клик — снять
        } else {
            setAttendanceMark(mark);
            setGradeValue(null); // Сбрасываем оценку при выборе пометки
        }
    };

    const handleSubmit = async () => {
        if (!gradeValue && !attendanceMark) {
            showError('Выберите оценку или пометку посещаемости');
            return;
        }

        setLoading(true);
        try {
            await api.post('/journal/grades', {
                student_id: student.id,
                subject_id: subject.id,
                class_id: classId,
                grade_value: gradeValue || null,
                work_type_id: attendanceMark ? null : (gradeType ? Number(gradeType) : null),
                attendance_mark: attendanceMark || null,
                topic_id: topicId ? Number(topicId) : null,
                lesson_date: date,
                comment: comment || null
            });
            showSuccess(attendanceMark ? `Пометка «${attendanceMark}» выставлена` : 'Оценка выставлена');
            onSave();
            onClose();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Ошибка сохранения';
            showError(message);
        } finally {
            setLoading(false);
        }
    };


    return (
        <Modal isOpen={true} onClose={onClose} title="Новая оценка" size="default">
            <div className={styles.modalBody}>
                <div className={styles.studentInfo}>
                    <div className={styles.modalStudentName}>{student.last_name} {student.first_name}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {new Date(date).toLocaleDateString('ru-RU')} • {subject.name}
                    </div>
                </div>

                {/* Оценки */}
                <div className={styles.gradeButtons}>
                    {[5, 4, 3, 2, 1].map(g => (
                        <button
                            key={g}
                            className={`${styles.gradeBtn} ${styles[`grade${g}`]} ${gradeValue === g ? styles.selected : ''}`}
                            onClick={() => handleGradeSelect(g)}
                            data-grade={g}
                        >
                            {g}
                        </button>
                    ))}
                </div>

                {/* Пометки посещаемости */}
                <div style={{
                    display: 'flex', justifyContent: 'center', gap: '8px',
                    marginBottom: '16px'
                }}>
                    {ATTENDANCE_MARKS.map(mark => (
                        <button
                            key={mark.value}
                            onClick={() => handleAttendanceSelect(mark.value)}
                            title={mark.label}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: attendanceMark === mark.value
                                    ? `2px solid ${mark.color}`
                                    : '2px solid var(--border-color)',
                                background: attendanceMark === mark.value ? mark.bg : 'var(--bg-tertiary)',
                                color: attendanceMark === mark.value ? mark.color : 'var(--text-secondary)',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                        >
                            {mark.display || mark.value}
                        </button>
                    ))}
                </div>



                {!attendanceMark && workTypes.length > 0 && (
                    <div className={styles.formGroup} style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Тип работы</label>
                        <select
                            className={styles.select}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                            value={gradeType}
                            onChange={e => setGradeType(e.target.value)}
                        >
                            {workTypes.map(wt => (
                                <option key={wt.id} value={wt.id.toString()}>{wt.name} (x{wt.weight})</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className={styles.formGroup} style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Тема (необязательно)</label>
                    <select
                        className={styles.select}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                        value={topicId}
                        onChange={e => setTopicId(e.target.value)}
                    >
                        <option value="">Без привязки к теме</option>
                        {topics.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>

                <div className={styles.formGroup} style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Комментарий</label>
                    <textarea
                        className={styles.input}
                        style={{ width: '100%', minHeight: '80px', padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="Например: опоздал на урок"
                    />
                </div>

                <button
                    className={styles.btnPrimary}
                    style={{ width: '100%', padding: '12px', background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                    onClick={handleSubmit}
                    disabled={loading || (!gradeValue && !attendanceMark)}
                >
                    {loading ? 'Сохранение...' : (attendanceMark ? `Поставить «${attendanceMark}»` : 'Поставить оценку')}
                </button>
            </div>
        </Modal>
    );
}
