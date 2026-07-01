import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/lib/apiClient';
import { useToast } from '@/context/ToastContext';
import styles from './TeacherScheduleTab.module.css';
import { SkeletonCard } from '@/components/ui/Skeleton';

// Types for the Teacher Diary Response
interface HomeworkInfo {
    id: number;
    title: string;
    description: string;
    attachments?: { id: number; filename?: string; url_link?: string; }[];
}

interface ControlWorkInfo {
    id: number;
    work_type: string;
    title: string;
}

interface TeacherLesson {
    lesson_number: number;
    subject_id: number;
    subject_name: string;
    class_id: number;
    class_name: string;
    room: string | null;
    group_name?: string;
    start_time?: string;
    end_time?: string;
    homework: HomeworkInfo[];
    control_work: ControlWorkInfo | null;
}

interface TeacherDiaryDay {
    date: string;
    day_name: string;
    is_today: boolean;
    lessons: TeacherLesson[];
}

interface TeacherDiaryResponse {
    teacher_id: number;
    teacher_name: string;
    week_start: string;
    week_end: string;
    week_offset: number;
    diary: Record<string, TeacherDiaryDay>;
}

interface TeacherScheduleTabProps {
    onLessonSelect: (lesson: TeacherLesson, date: string) => void;
    refreshTrigger?: number;
}



export default function TeacherScheduleTab({ onLessonSelect, refreshTrigger = 0 }: TeacherScheduleTabProps) {
    const { showError } = useToast();

    const [weekOffset, setWeekOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [diaryData, setDiaryData] = useState<TeacherDiaryResponse | null>(null);

    const loadDiary = useCallback(async (offset: number) => {
        setLoading(true);
        try {
            const data = await api.get<TeacherDiaryResponse>(`/teacher/diary?week_offset=${offset}`);
            setDiaryData(data);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Ошибка загрузки расписания';
            showError(message);
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        loadDiary(weekOffset);
    }, [weekOffset, loadDiary, refreshTrigger]);

    const handlePrevWeek = () => setWeekOffset(prev => prev - 1);
    const handleNextWeek = () => setWeekOffset(prev => prev + 1);
    const handleCurrentWeek = () => setWeekOffset(0);

    // Grouping lessons similarly to the student view
    // The API groups by day_of_week index (0-5)

    // Process week label
    const weekLabel = useMemo(() => {
        if (!diaryData) return '';
        const start = new Date(diaryData.week_start);
        const end = new Date(diaryData.week_end);

        const formatOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };

        if (start.getMonth() === end.getMonth()) {
            return `${start.getDate()} — ${end.toLocaleDateString('ru-RU', formatOptions)}`;
        }
        return `${start.toLocaleDateString('ru-RU', formatOptions)} — ${end.toLocaleDateString('ru-RU', formatOptions)}`;
    }, [diaryData]);

    if (loading && !diaryData) return <div style={{ padding: '20px' }}><SkeletonCard /></div>;

    const days = diaryData ? Object.values(diaryData.diary) : [];

    return (
        <div style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto' }}>
            <div className={styles.scheduleHeader}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <div className={styles.weekControls}>
                        <button
                            className={styles.weekBtn}
                            onClick={handlePrevWeek}
                            title="Предыдущая неделя"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6"></polyline>
                            </svg>
                        </button>

                        <button
                            className={`${styles.currentWeekBtn} ${weekOffset === 0 ? styles.active : ''}`}
                            style={{ cursor: 'default' }}
                        >
                            {weekOffset === 0 ? 'Текущая неделя' : weekLabel}
                        </button>

                        <button
                            className={styles.weekBtn}
                            onClick={handleNextWeek}
                            title="Следующая неделя"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </button>
                    </div>

                    {weekOffset !== 0 && (
                        <button
                            onClick={handleCurrentWeek}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                fontSize: '0.85rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'color 0.2s',
                                padding: '0'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                        >
                            Вернуться к текущей неделе
                        </button>
                    )}
                </div>
            </div>


            {loading && diaryData && (
                <div style={{ position: 'relative', width: '100%', height: '3px', backgroundColor: 'var(--border-color)', overflow: 'hidden', borderRadius: '4px', marginBottom: '20px' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', backgroundColor: 'var(--accent-primary)', animation: 'indeterminateAnimation 1.5s infinite linear', width: '30%' }}></div>
                </div>
            )}

            <div className={styles.scheduleGrid}>
                {(() => {
                    const globalMaxLesson = Math.max(
                        0,
                        ...days.flatMap(d => d.lessons.map(l => l.lesson_number))
                    );

                    return days.map((day, index) => {
                        const lessons = day.lessons.sort((a, b) => a.lesson_number - b.lesson_number);

                        return (
                            <div
                                key={index}
                                className={`${styles.dayCard} ${day.is_today ? styles.today : ''}`}
                            >
                                <div className={styles.dayHeader}>
                                    <div className={styles.dayTop}>
                                        <h3 className={styles.dayName}>{day.day_name}</h3>
                                        {day.is_today && <span className={styles.todayBadge}>Сегодня</span>}
                                    </div>
                                    <div className={styles.dayDate}>
                                        {new Date(day.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                                    </div>
                                </div>

                                <div className={styles.lessonsList}>
                                    {lessons.length > 0 ? (
                                        (() => {
                                            const allLessonNumbers = Array.from({ length: globalMaxLesson }, (_, i) => i + 1);

                                            return allLessonNumbers.map(lessonNum => {
                                                const lesson = lessons.find(l => l.lesson_number === lessonNum);


                                                if (!lesson) {
                                                    // Empty slot
                                                    return (
                                                        <div key={`empty-${lessonNum}`} className={`${styles.lessonItem} ${styles.emptyLesson}`}>
                                                            <div className={styles.lessonNumWrapper}>
                                                                <span className={styles.lessonNum}>{lessonNum}</span>
                                                            </div>
                                                            <div className={styles.lessonDetails}>
                                                                <div className={styles.lessonContentStack}>
                                                                    <div className={styles.timeBlockInline}>
                                                                        — —
                                                                    </div>
                                                                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>
                                                                        Окно
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                // Actual lesson slot
                                                return (
                                                    <div
                                                        key={`${lesson.lesson_number}-${lesson.subject_id}-${lesson.class_id}`}
                                                        className={styles.lessonItem}
                                                        style={{ cursor: 'pointer', position: 'relative' }}
                                                        onClick={() => onLessonSelect(lesson, day.date)}
                                                    >
                                                        <div className={styles.lessonNumWrapper}>
                                                            <span className={styles.lessonNum}>{lesson.lesson_number}</span>
                                                        </div>

                                                        <div className={styles.lessonDetails}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                <div className={styles.lessonContentStack}>
                                                                    <div className={styles.timeBlockInline}>
                                                                        {lesson.start_time || '—'} - {lesson.end_time || '—'}
                                                                    </div>

                                                                    <div className={styles.lessonSubjectRow}>
                                                                        <span className={styles.lessonSubject}>{lesson.subject_name}</span>
                                                                        <div className={styles.lessonMeta}>
                                                                            {lesson.class_name && (
                                                                                <span className={styles.teacherName}>
                                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '2px' }}>
                                                                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                                                                        <circle cx="9" cy="7" r="4"></circle>
                                                                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                                                                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                                                                    </svg>
                                                                                    {lesson.class_name}
                                                                                </span>
                                                                            )}
                                                                            {lesson.room && (
                                                                                <span className={styles.roomBadge}>
                                                                                    Каб. {lesson.room}
                                                                                </span>
                                                                            )}
                                                                            {lesson.group_name && (
                                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 600, color: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.1)', padding: '1px 6px', borderRadius: '4px', marginLeft: '4px' }}>
                                                                                    👥 {lesson.group_name}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className={styles.hwStatus} style={{ color: lesson.homework.length > 0 ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                                                                    {lesson.homework.length > 0 ? 'ДЗ задано' : 'ДЗ не задано'}
                                                                </div>
                                                            </div>

                                                            {lesson.control_work && (
                                                                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                                                    <span style={{
                                                                        display: 'flex', alignItems: 'center', gap: '4px',
                                                                        fontSize: '11px', fontWeight: 600,
                                                                        color: lesson.control_work.work_type === 'контрольная' ? '#dc2626' : '#2563eb',
                                                                        backgroundColor: lesson.control_work.work_type === 'контрольная' ? '#fef2f2' : '#eff6ff',
                                                                        padding: '2px 6px', borderRadius: '4px'
                                                                    }}
                                                                        title={lesson.control_work.title || lesson.control_work.work_type}
                                                                    >
                                                                        {lesson.control_work.work_type === 'контрольная' ? 'КР' : 'СР'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()
                                    ) : (
                                        <div className={styles.emptyDay}>
                                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                <polyline points="17 8 12 3 7 8"></polyline>
                                                <line x1="12" y1="3" x2="12" y2="15"></line>
                                            </svg>
                                            <span>Нет уроков</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    });
                })()}
            </div>
        </div>
    );
}
