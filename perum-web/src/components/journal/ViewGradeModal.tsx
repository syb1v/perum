'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/apiClient';
import { useToast } from '@/context/ToastContext';
import Modal from '@/components/ui/Modal';
import styles from '../../app/teacher/journal/page.module.css';
import type { Grade, WorkType } from '@/types';

interface ViewGradeModalProps {
    gradeId: number;
    onClose: () => void;
    onUpdate: () => void;
}

const ATTENDANCE_MARKS = [
    { value: 'УП', label: 'Уваж. причина', color: '#16a34a', bg: '#dcfce7' },
    { value: 'НП', label: 'Неуваж. причина', color: '#dc2626', bg: '#fee2e2' },
    { value: 'осв.', label: 'Освобождён', color: '#2563eb', bg: '#dbeafe' },
    { value: 'точка', label: 'Долг (Точка)', color: '#dc2626', bg: '#fee2e2', display: '•' },
];

export default function ViewGradeModal({ gradeId, onClose, onUpdate }: ViewGradeModalProps) {
    const { showError, showSuccess } = useToast();
    const [grade, setGrade] = useState<Grade | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Edit state
    const [editValue, setEditValue] = useState<number | null>(null);
    const [editAttendanceMark, setEditAttendanceMark] = useState<string | null>(null);
    const [editWorkTypeId, setEditWorkTypeId] = useState<number | null>(null);
    const [editType, setEditType] = useState('');
    const [editComment, setEditComment] = useState('');
    const [workTypes, setWorkTypes] = useState<WorkType[]>([]);

    useEffect(() => {
        api.get<{ success: boolean; work_types: WorkType[] }>('/journal/work-types')
            .then(data => {
                if (data.work_types) setWorkTypes(data.work_types);
            })
            .catch(err => console.error('Failed to load work types', err));
    }, []);

    useEffect(() => {
        api.get<Grade>(`/journal/grades/${gradeId}`)
            .then(data => {
                setGrade(data);
                setEditValue(data.grade_value || data.value || null);
                setEditAttendanceMark(data.attendance_mark || null);
                setEditWorkTypeId(data.work_type_id || null);
                setEditType(data.grade_type || data.type);
                setEditComment(data.comment || '');
            })
            .catch(() => {
                showError('Ошибка загрузки оценки');
                onClose();
            })
            .finally(() => setLoading(false));
    }, [gradeId, showError, onClose]);

    if (loading || !grade) return null;

    const handleUpdate = async () => {
        if (!editValue && !editAttendanceMark) {
            showError('Выберите оценку или пометку посещаемости');
            return;
        }
        try {
            await api.put(`/journal/grades/${gradeId}`, {
                grade_value: editValue,
                work_type_id: editAttendanceMark ? null : editWorkTypeId,
                grade_type: editType, // Fallback if no work types
                attendance_mark: editAttendanceMark,
                comment: editComment
            });
            showSuccess('Оценка обновлена');
            onUpdate();
            onClose();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Ошибка обновления';
            showError(message);
        }
    };

    const handleDelete = async () => {
        try {
            await api.del(`/journal/grades/${gradeId}`);
            showSuccess('Оценка удалена');
            onUpdate();
            onClose();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Ошибка удаления';
            showError(message);
        }
    };

    const content = (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={isEditing ? 'Редактирование оценки' : 'Информация об оценке'}
            size="default"
        >
            <div className={styles.modalBody}>
                {!isEditing ? (
                    <>
                        <div className={styles.gradeViewValue}>
                            {grade.attendance_mark
                                ? (grade.attendance_mark === 'точка' ? '•' : grade.attendance_mark)
                                : (grade.grade_value || grade.value)}
                        </div>
                        {grade.attendance_mark && (
                            <div style={{ textAlign: 'center', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                {grade.attendance_mark === 'УП' ? 'Уважительная причина'
                                    : grade.attendance_mark === 'НП' ? 'Неуважительная причина'
                                    : grade.attendance_mark === 'точка' ? 'Долг (Точка)'
                                    : grade.attendance_mark === 'осв.' ? 'Освобождён'
                                    : grade.attendance_mark}
                            </div>
                        )}
                        {!!grade.points_earned && (
                            <div className={`${styles.gradeViewPoints} ${grade.points_earned < 0 ? styles.negative : ''}`}>
                                {grade.points_earned > 0 ? '+' : ''}{grade.points_earned} ливок
                            </div>
                        )}

                        <div className={styles.gradeDetailRow}>
                            <span className={styles.detailLabel}>Ученик</span>
                            <span className={styles.detailValue}>
                                {grade.student?.last_name} {grade.student?.first_name}
                            </span>
                        </div>
                        <div className={styles.gradeDetailRow}>
                            <span className={styles.detailLabel}>Предмет</span>
                            <span className={styles.detailValue}>{grade.subject?.name}</span>
                        </div>
                        {!grade.attendance_mark && (
                            <div className={styles.gradeDetailRow}>
                                <span className={styles.detailLabel}>Тип работы</span>
                                <span className={styles.detailValue}>
                                    {grade.grade_type || grade.type}
                                    {grade.weight ? ` (x${grade.weight})` : ''}
                                </span>
                            </div>
                        )}
                        <div className={styles.gradeDetailRow}>
                            <span className={styles.detailLabel}>Дата урока</span>
                            <span className={styles.detailValue}>
                                {new Date(grade.lesson_date || grade.created_at).toLocaleDateString('ru-RU')}
                            </span>
                        </div>
                        {grade.comment && (
                            <div className={styles.gradeDetailRow} style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                                <span className={styles.detailLabel}>Комментарий</span>
                                <span className={styles.detailValue} style={{ fontWeight: 400, marginTop: '4px' }}>
                                    {grade.comment}
                                </span>
                            </div>
                        )}

                        {confirmDelete ? (
                            <div style={{ marginTop: '20px', textAlign: 'center' }}>
                                <p style={{ marginBottom: '10px' }}>Вы уверены, что хотите удалить оценку?</p>
                                <div className={styles.modalActions}>
                                    <button className={styles.btnSecondary} onClick={() => setConfirmDelete(false)}>Отмена</button>
                                    <button className={styles.btnDanger} onClick={handleDelete}>Удалить</button>
                                </div>
                            </div>
                        ) : (
                            <div className={styles.modalActions}>
                                <button className={styles.btnSecondary} onClick={() => setIsEditing(true)}>Редактировать</button>
                                <button className={styles.btnDanger} onClick={() => setConfirmDelete(true)}>Удалить</button>
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className={styles.gradeButtons}>
                            {[5, 4, 3, 2, 1].map(g => (
                                <button
                                    key={g}
                                    className={`${styles.gradeBtn} ${styles[`grade${g}`]} ${editValue === g ? styles.selected : ''}`}
                                    onClick={() => {
                                        setEditValue(g);
                                        setEditAttendanceMark(null);
                                    }}
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
                                    onClick={() => {
                                        if (editAttendanceMark === mark.value) {
                                            setEditAttendanceMark(null);
                                        } else {
                                            setEditAttendanceMark(mark.value);
                                            setEditValue(null);
                                        }
                                    }}
                                    title={mark.label}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: '8px',
                                        border: editAttendanceMark === mark.value
                                            ? `2px solid ${mark.color}`
                                            : '2px solid var(--border-color)',
                                        background: editAttendanceMark === mark.value ? mark.bg : 'var(--bg-tertiary)',
                                        color: editAttendanceMark === mark.value ? mark.color : 'var(--text-secondary)',
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

                        {!editAttendanceMark && (
                            <div className={styles.formGroup}>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Тип работы</label>
                                {workTypes.length > 0 ? (
                                <select
                                    className={styles.select}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                                    value={editWorkTypeId || ''}
                                    onChange={e => setEditWorkTypeId(e.target.value ? Number(e.target.value) : null)}
                                >
                                    <option value="" disabled>Выберите тип работы</option>
                                    {workTypes.map(wt => (
                                        <option key={wt.id} value={wt.id}>{wt.name} (x{wt.weight})</option>
                                    ))}
                                </select>
                            ) : (
                                <select
                                    className={styles.select}
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                                    value={editType}
                                    onChange={e => setEditType(e.target.value)}
                                >
                                    <option value="ответ">Ответ на уроке</option>
                                    <option value="дз">Домашнее задание</option>
                                    <option value="самостоятельная">Самостоятельная работа</option>
                                    <option value="контрольная">Контрольная работа</option>
                                </select>
                            )}
                            </div>
                        )}

                        <div className={styles.formGroup}>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Комментарий</label>
                            <textarea
                                style={{ width: '100%', minHeight: '80px', padding: '10px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                                value={editComment}
                                onChange={e => setEditComment(e.target.value)}
                            />
                        </div>

                        <div className={styles.modalActions}>
                            <button className={styles.btnSecondary} onClick={() => setIsEditing(false)}>Отмена</button>
                            <button className={styles.btnPrimary} style={{ flex: 1 }} onClick={handleUpdate}>Сохранить</button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );

    return content;
}
