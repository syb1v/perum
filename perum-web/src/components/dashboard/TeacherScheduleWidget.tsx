'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/apiClient';
import Modal from '@/components/ui/Modal';
import styles from './TeacherScheduleWidget.module.css';

/* ────── Types ────── */
interface HomeworkItem {
    id: number;
    title: string;
    description?: string;
}

interface ControlWorkItem {
    id: number;
    work_type: string;
    title?: string;
}

interface DiaryLesson {
    lesson_number: number;
    subject_id: number;
    subject_name: string;
    class_id: number;
    class_name: string;
    room?: string;
    start_time?: string;
    end_time?: string;
    homework: HomeworkItem[];
    control_work?: ControlWorkItem | null;
}

interface DiaryDay {
    date: string;
    day_name: string;
    is_today: boolean;
    lessons: DiaryLesson[];
}

interface DiaryResponse {
    teacher_id: number;
    teacher_name: string;
    week_start: string;
    week_end: string;
    week_offset: number;
    diary: { [day: number]: DiaryDay };
}

const DAY_NAMES = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

interface TeacherScheduleWidgetProps {
    className?: string;
}

export default function TeacherScheduleWidget({ className = '' }: TeacherScheduleWidgetProps) {
    const [diary, setDiary] = useState<{ [day: number]: DiaryDay } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dayOffset, setDayOffset] = useState(0);
    const [selectedLesson, setSelectedLesson] = useState<DiaryLesson | null>(null);
    const router = useRouter();

    // Calculate the week_offset and the target api day from dayOffset
    const getTargetInfo = useCallback(() => {
        const today = new Date();
        const target = new Date(today);
        target.setDate(today.getDate() + dayOffset);

        // Calculate week offset relative to today's week
        const todayWeekday = today.getDay() === 0 ? 6 : today.getDay() - 1; // 0=Mon
        const todayWeekStart = new Date(today);
        todayWeekStart.setDate(today.getDate() - todayWeekday);
        todayWeekStart.setHours(0, 0, 0, 0);

        const targetWeekday = target.getDay() === 0 ? 6 : target.getDay() - 1; // 0=Mon
        const targetWeekStart = new Date(target);
        targetWeekStart.setDate(target.getDate() - targetWeekday);
        targetWeekStart.setHours(0, 0, 0, 0);

        const weekOffset = Math.round((targetWeekStart.getTime() - todayWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
        const apiDay = targetWeekday; // 0=Mon ... 5=Sat, 6=Sun

        return { target, weekOffset, apiDay };
    }, [dayOffset]);

    const { target: targetDate, weekOffset, apiDay } = getTargetInfo();

    useEffect(() => {
        setLoading(true);
        api.get<DiaryResponse>(`/teacher/diary?week_offset=${weekOffset}`)
            .then((data) => {
                setDiary(data.diary || {});
                setError(null);
            })
            .catch((err: unknown) => {
                console.error('Failed to load diary:', err);
                setDiary({});
                setError('Не удалось загрузить расписание');
            })
            .finally(() => setLoading(false));
    }, [weekOffset]);

    const dayData = diary ? diary[apiDay] : null;
    const lessons = dayData?.lessons || [];
    const sortedLessons = [...lessons].sort((a, b) => a.lesson_number - b.lesson_number);

    const dayLabel = `${DAY_NAMES[targetDate.getDay()]}, ${targetDate.getDate()} ${MONTHS[targetDate.getMonth()]}`;
    const emptyMsg = dayOffset === 0 ? 'Сегодня нет уроков' : 'В этот день нет уроков';

    const handleOpenJournal = () => {
        if (!selectedLesson) return;
        const dateStr = targetDate.toISOString().split('T')[0];
        router.push(`/teacher/journal?classId=${selectedLesson.class_id}&subjectId=${selectedLesson.subject_id}&date=${dateStr}`);
    };

    return (
        <section className={`${styles.card} ${className}`}>
            <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span>{dayOffset === 0 ? 'Мои уроки сегодня' : 'Мои уроки'}</span>
                </h2>
            </div>

            <div className={styles.dayNav}>
                <button
                    className={styles.dayNavBtn}
                    onClick={() => setDayOffset(prev => prev - 1)}
                    title="Предыдущий день"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
                <div className={styles.dayNavInfo}>
                    <span className={styles.dayNavLabel}>{dayLabel}</span>
                    {dayOffset !== 0 && (
                        <button
                            className={styles.dayNavToday}
                            onClick={() => setDayOffset(0)}
                        >
                            К сегодня
                        </button>
                    )}
                </div>
                <button
                    className={styles.dayNavBtn}
                    onClick={() => setDayOffset(prev => prev + 1)}
                    title="Следующий день"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>
            </div>

            <div className={styles.scheduleList}>
                {loading ? (
                    <div className={styles.loading}>
                        <div className={styles.spinner}></div>
                        <span>Загрузка расписания...</span>
                    </div>
                ) : error ? (
                    <div className={styles.error}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <p>{error}</p>
                    </div>
                ) : sortedLessons.length === 0 ? (
                    <div className={styles.empty}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                            <line x1="9" y1="9" x2="9.01" y2="9" />
                            <line x1="15" y1="9" x2="15.01" y2="9" />
                        </svg>
                        <p>{emptyMsg}</p>
                    </div>
                ) : (
                    sortedLessons.map((lesson, index) => (
                        <div
                            key={`lesson-${lesson.lesson_number}-${lesson.class_id}-${index}`}
                            className={`${styles.scheduleItem} ${styles.clickableItem}`}
                            onClick={() => setSelectedLesson(lesson)}
                        >
                            <div className={styles.lessonNum}>{lesson.lesson_number}</div>
                            <div className={styles.lessonInfo}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{lesson.start_time || '—'} – {lesson.end_time || '—'}</div>
                                <div className={styles.lessonSubject}>{lesson.subject_name || 'Урок'}</div>
                                <div className={styles.lessonClass}>{lesson.class_name || ''}</div>
                                {lesson.homework && lesson.homework.length > 0 && (
                                    <div className={styles.lessonBadges}>
                                        <span className={styles.homeworkBadge} title={lesson.homework.map(h => h.title).join(', ')}>
                                            📝 ДЗ
                                        </span>
                                    </div>
                                )}
                                {lesson.control_work && (
                                    <div className={styles.lessonBadges}>
                                        <span className={styles.cwBadge} title={lesson.control_work.title || lesson.control_work.work_type}>
                                            📋 {lesson.control_work.work_type === 'контрольная' ? 'КР' : 'СР'}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className={styles.lessonMeta}>
                                <span className={styles.lessonRoom}>Каб. {lesson.room || '—'}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Lesson Info Modal */}
            <Modal
                isOpen={!!selectedLesson}
                onClose={() => setSelectedLesson(null)}
                title="Информация об уроке"
                size="default"
            >
                {selectedLesson && (
                    <div className={styles.modalContent}>
                        <div className={styles.lessonDetails}>
                            <div className={styles.detailRow}>
                                <span className={styles.detailLabel}>Предмет:</span>
                                <span className={styles.detailValue}>{selectedLesson.subject_name}</span>
                            </div>
                            <div className={styles.detailRow}>
                                <span className={styles.detailLabel}>Класс:</span>
                                <span className={styles.detailValue}>{selectedLesson.class_name}</span>
                            </div>
                            <div className={styles.detailRow}>
                                <span className={styles.detailLabel}>Кабинет:</span>
                                <span className={styles.detailValue}>{selectedLesson.room || '—'}</span>
                            </div>

                            {/* Homework section */}
                            {selectedLesson.homework && selectedLesson.homework.length > 0 && (
                                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>📝 Домашнее задание:</div>
                                    {selectedLesson.homework.map((hw) => (
                                        <div key={hw.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
                                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{hw.title}</div>
                                            {hw.description && (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{hw.description}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Control work section */}
                            {selectedLesson.control_work && (
                                <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--error)' }}>
                                        📋 {selectedLesson.control_work.work_type}{selectedLesson.control_work.title ? `: ${selectedLesson.control_work.title}` : ''}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className={styles.modalActions}>
                            <button className={styles.btnSecondary} onClick={() => setSelectedLesson(null)}>Закрыть</button>
                            <button className={styles.btnPrimary} onClick={handleOpenJournal}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                </svg>
                                Открыть журнал
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </section>
    );
}
