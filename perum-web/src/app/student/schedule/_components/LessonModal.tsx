'use client';

import Modal from '@/components/ui/Modal';
import { FlatLesson } from '@/hooks/useSchedule';
import styles from '../page.module.css';

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

interface LessonModalProps {
    lesson: FlatLesson;
    onClose: () => void;
}

export default function LessonModal({ lesson, onClose }: LessonModalProps) {
    const now = new Date();
    const grades = lesson.grades || [];
    const homework = lesson.homework || [];

    return (
        <Modal isOpen={true} onClose={onClose} title={lesson.subject_name || 'Урок'}>
            <div className={styles.lessonInfoGrid}>
                <div className={styles.infoItem}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span>{DAY_NAMES[lesson.day_of_week - 1]}, {lesson.lesson_number}-й урок</span>
                </div>
                <div className={styles.infoItem}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>{lesson.start_time || '—'} – {lesson.end_time || '—'}</span>
                </div>
                <div className={styles.infoItem}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>{lesson.teacher_name || 'Не указан'}</span>
                </div>
                <div className={styles.infoItem}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <span>Каб. {lesson.room || '—'}</span>
                </div>
                {lesson.group_name && (
                    <div className={styles.infoItem}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span style={{ color: '#7c3aed', fontWeight: 600 }}>{lesson.group_name}</span>
                    </div>
                )}
            </div>

            {grades.length > 0 && (
                <div className={styles.modalSection}>
                    <h4 className={styles.sectionLabel}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                        Оценки
                    </h4>
                    <div className={styles.modalGradesList}>
                        {grades.map((g, i) => (
                            <div key={i} className={styles.modalGradeItem}>
                                <span className={styles.gradeBadgeLg} style={{ backgroundColor: g.color || '#667' }}>{g.value}</span>
                                <div className={styles.gradeInfo}>
                                    <span className={styles.gradeInfoType}>
                                        {g.type || 'Оценка'}
                                        {g.weight ? ` (x${g.weight})` : ''}
                                    </span>
                                    {g.points !== undefined && (
                                        <span className={`${styles.gradeInfoPoints} ${g.points >= 0 ? styles.gradeInfoPointsPositive : styles.gradeInfoPointsNegative}`}>
                                            {g.points > 0 ? '+' : ''}{g.points} ливок
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {homework.length > 0 && (
                <div className={styles.modalSection}>
                    <h4 className={styles.sectionLabel}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                        </svg>
                        Домашнее задание
                    </h4>
                    <div className={styles.modalHomeworkList}>
                        {homework.map((hw, i) => {
                            const dueDate = hw.due_date ? new Date(hw.due_date) : null;
                            let dueText = '';
                            let dueClass = '';
                            if (dueDate) {
                                const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                if (diffDays < 0) { dueClass = styles.hwDueOverdue; dueText = 'Просрочено'; }
                                else if (diffDays === 0) { dueClass = styles.hwDueUrgent; dueText = 'Сегодня'; }
                                else if (diffDays === 1) { dueClass = styles.hwDueUrgent; dueText = 'Завтра'; }
                                else { dueText = dueDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); }
                            }
                            return (
                                <div key={i} className={styles.modalHomeworkItem}>
                                    <div className={styles.hwTitle}>{hw.title}</div>
                                    {hw.description && <div className={styles.hwDesc}>{hw.description}</div>}
                                    {hw.attachments && hw.attachments.length > 0 && (
                                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {hw.attachments.map(att => (
                                                <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {att.url_link ? (
                                                        <a href={att.url_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', textDecoration: 'none' }}>
                                                            🔗 {att.url_link}
                                                        </a>
                                                    ) : (
                                                        <a href={`/api/attachments/${att.id}/download`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', textDecoration: 'none' }}>
                                                            📎 {att.filename}
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {dueText && <div className={`${styles.hwDue} ${dueClass}`}>Срок: {dueText}</div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {grades.length === 0 && homework.length === 0 && (
                <div className={styles.modalEmptyNote}>Нет оценок и домашних заданий</div>
            )}
        </Modal>
    );
}
