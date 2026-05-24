'use client';

import {  } from '@/context/ToastContext';
import styles from './page.module.css';

// Hooks
import { useSchedule, DAY_NAMES_FULL } from '@/hooks/useSchedule';

// Components
import LessonModal from './_components/LessonModal';
import AnalyticsDashboard from './_components/AnalyticsDashboard';


export default function StudentSchedule() {
    const {
        currentView, setCurrentView,
        weekOffset, setWeekOffset, weekLabel,
        dayDates, flatLessons, scheduleLoading, selectedLesson, setSelectedLesson,
        currentPeriod, weekPeriods,
        gradesData,
        worksData, worksLoading, worksFilter, setWorksFilter,
        analyticsData, analyticsLoading
    } = useSchedule();

    const todayStr = new Date().toDateString();
    const isToday = (d: Date) => d.toDateString() === todayStr;

    const filteredWorks = worksFilter === 'all' ? worksData : worksData.filter(w => w.status === worksFilter);

    const statusConfig: Record<string, { label: string; icon: string; color: string }> = {
        pending: { label: 'Ожидает', icon: '⏳', color: 'var(--accent-tertiary)' },
        completed: { label: 'Выполнено', icon: '✓', color: 'var(--success)' },
        overdue: { label: 'Просрочено', icon: '!', color: 'var(--error)' },
    };

    return (
        <div className={styles.schedulePage}>
            {/* ── Header with View Toggle ── */}
            <div className={styles.scheduleHeader}>
                <div className={styles.scheduleControls}>
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.viewBtn} ${currentView === 'schedule' ? styles.viewBtnActive : ''}`}
                            onClick={() => setCurrentView('schedule')}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            Дневник
                        </button>
                        <button
                            className={`${styles.viewBtn} ${currentView === 'grades' ? styles.viewBtnActive : ''}`}
                            onClick={() => setCurrentView('grades')}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                            </svg>
                            Успеваемость
                        </button>
                        <button
                            className={`${styles.viewBtn} ${currentView === 'works' ? styles.viewBtnActive : ''}`}
                            onClick={() => setCurrentView('works')}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                            </svg>
                            Мои работы
                        </button>
                    </div>
                </div>
            </div>

            {/* ════════ SCHEDULE (Дневник) VIEW ════════ */}
            <div className={currentView === 'schedule' ? styles.scheduleContentActive : styles.scheduleContent}>
                <div className={styles.weekNav}>
                    <button className={styles.weekNavBtn} onClick={() => setWeekOffset(o => o - 1)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>
                    <div className={styles.weekNavInfo}>
                        <span className={styles.weekLabel}>{weekLabel}</span>
                        {weekOffset !== 0 && (
                            <button className={styles.weekTodayLink} onClick={() => setWeekOffset(0)}>
                                Вернуться к текущей неделе
                            </button>
                        )}
                    </div>
                    <button className={styles.weekNavBtn} onClick={() => setWeekOffset(o => o + 1)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </button>
                </div>

                <div className={styles.scheduleGridContainer}>
                    {currentPeriod && (
                        <div className={styles.periodBanner}>
                            <span className={styles.periodLabel}>Текущий период:</span>
                            <span className={styles.periodName}>{currentPeriod.name}</span>
                            <span className={styles.periodDates}>
                                ({new Date(currentPeriod.start_date).toLocaleDateString()} — {new Date(currentPeriod.end_date).toLocaleDateString()})
                            </span>
                        </div>
                    )}
                    {scheduleLoading ? (
                        <div className={styles.scheduleLoading}><div className={styles.spinner} /><p>Загрузка расписания...</p></div>
                    ) : (
                        <div className={styles.scheduleGrid}>
                            {[0, 1, 2, 3, 4, 5].map(dayIdx => {
                                const d = dayDates[dayIdx];
                                const isTodayDate = d && isToday(d);
                                const holidayPeriod = d ? weekPeriods.find(p => ['vacation', 'holiday'].includes(p.period_type) && new Date(p.start_date) <= d && new Date(p.end_date) >= d) : null;
                                const dayLessons = flatLessons.filter(l => l.day_of_week === dayIdx + 1).sort((a, b) => a.lesson_number - b.lesson_number);
                                const maxLesson = Math.max(0, ...flatLessons.map(l => l.lesson_number));

                                return (
                                    <div key={dayIdx} className={`${styles.dayCard} ${isTodayDate ? styles.today : ''}`}>
                                        <div className={styles.dayHeader}>
                                            <div className={styles.dayTop}>
                                                <h3 className={styles.dayName}>{DAY_NAMES_FULL[dayIdx]}</h3>
                                                {isTodayDate && <span className={styles.todayBadge}>Сегодня</span>}
                                            </div>
                                            <div className={styles.dayDate}>{d ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : ''}</div>
                                        </div>
                                        <div className={styles.lessonsList}>
                                            {dayLessons.length > 0 ? (
                                                Array.from({ length: maxLesson }, (_, i) => i + 1).map(num => {
                                                    const lesson = dayLessons.find(l => l.lesson_number === num);
                                                    if (!lesson) return <div key={num} className={`${styles.lessonItem} ${styles.emptyLesson}`}><div className={styles.lessonNumWrapper}><span className={styles.lessonNum}>{num}</span></div><div className={styles.lessonDetails}>Окно</div></div>;

                                                    return (
                                                        <div key={`${num}-${lesson.subject_id}`} className={styles.lessonItem} style={{ cursor: 'pointer' }} onClick={() => setSelectedLesson(lesson)}>
                                                            <div className={styles.lessonNumWrapper}><span className={styles.lessonNum}>{num}</span></div>
                                                            <div className={styles.lessonDetails}>
                                                                <div className={styles.lessonHeaderRow}>
                                                                    <div className={styles.lessonMainInfo}>
                                                                        <span className={styles.lessonSubject}>{lesson.subject_name}</span>
                                                                        <div className={styles.lessonMeta}>
                                                                            <span className={styles.timeRange}>{lesson.start_time} - {lesson.end_time}</span>
                                                                            {lesson.room && <span className={styles.roomBadge}>Каб. {lesson.room}</span>}
                                                                        </div>
                                                                    </div>
                                                                    <div className={styles.lessonStatus}>
                                                                        {lesson.grades?.map((g, gi) => <span key={gi} className={styles.gradeMini} style={{ backgroundColor: g.color }}>{g.value}</span>)}
                                                                        {lesson.homework?.length > 0 && <span className={styles.hwIndicator}>ДЗ</span>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className={styles.emptyDay}>{holidayPeriod ? holidayPeriod.name : 'Нет уроков'}</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ════════ WORKS VIEW ════════ */}
            <div className={currentView === 'works' ? styles.scheduleContentActive : styles.scheduleContent}>
                <div className={styles.worksHeader}><h3>Мои работы</h3></div>
                <div className={styles.worksFilters}>
                    {(['all', 'pending', 'completed', 'overdue'] as const).map(f => (
                        <button key={f} className={`${styles.workFilter} ${worksFilter === f ? styles.workFilterActive : ''}`} onClick={() => setWorksFilter(f)}>
                            {f === 'all' ? 'Все' : f === 'pending' ? 'Ожидает' : f === 'completed' ? 'Выполнено' : 'Просрочено'}
                        </button>
                    ))}
                </div>
                <div className={styles.worksList}>
                    {worksLoading ? (
                        <div className={styles.scheduleLoading}><div className={styles.spinner} /></div>
                    ) : filteredWorks.map((work, idx) => {
                        const st = statusConfig[work.status] || statusConfig.pending;
                        return (
                            <div key={idx} className={styles.workItem}>
                                <div className={styles.workStatusIcon} style={{ background: st.color }}>{st.icon}</div>
                                <div className={styles.workInfo}>
                                    <span className={styles.workTitle}>{work.title}</span>
                                    <span className={styles.workSubject}>{work.subject}</span>
                                </div>
                                <div className={styles.workMeta}>
                                    <span className={styles.workDue}>{work.due_date ? new Date(work.due_date).toLocaleDateString() : '—'}</span>
                                    <span className={styles.workStatusLabel} style={{ color: st.color }}>{st.label}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ════════ ANALYTICS VIEW ════════ */}
            <div className={currentView === 'grades' ? styles.scheduleContentActive : styles.scheduleContent}>
                {analyticsLoading ? (
                    <div className={styles.scheduleLoading}><div className={styles.spinner} /><p>Загрузка аналитики...</p></div>
                ) : (
                    <AnalyticsDashboard gradesData={gradesData} analyticsData={analyticsData} />
                )}
            </div>

            {selectedLesson && <LessonModal lesson={selectedLesson} onClose={() => setSelectedLesson(null)} />}
        </div>
    );
}
