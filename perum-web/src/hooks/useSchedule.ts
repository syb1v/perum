import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/apiClient';
import { useToast } from '@/context/ToastContext';
import type { DiaryResponse, DiaryLesson, GradesResponse, Subject, Work, PeriodInfo } from '@/types';

export type ViewType = 'schedule' | 'grades' | 'works';
export type WorkFilter = 'all' | 'pending' | 'completed' | 'overdue';

export interface FlatLesson extends DiaryLesson {
    day_of_week: number; // 1-6
}

export interface GradeRow {
    id: number;
    date: string;
    subject_name: string;
    subject_id: number;
    type: string;
    value: number;
    color: string;
    points: number;
    weight?: number;
}

export interface AnalyticsPeriod {
    id: number;
    name: string;
    start_date: string;
    end_date: string;
}

export interface AnalyticsSubject {
    subject_id: number;
    subject_name: string;
    periods: Record<string, number | null>;
    year_average: number | null;
}

export interface AnalyticsResponse {
    period_type: string;
    periods: AnalyticsPeriod[];
    subjects: AnalyticsSubject[];
}

export const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export const DAY_NAMES_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function useSchedule() {
    const { showError } = useToast();

    // View state
    const [currentView, setCurrentView] = useState<ViewType>('schedule');

    // Schedule state
    const [weekOffset, setWeekOffset] = useState(0);
    const [weekLabel, setWeekLabel] = useState('Текущая неделя');
    const [dayDates, setDayDates] = useState<Date[]>([]);
    const [flatLessons, setFlatLessons] = useState<FlatLesson[]>([]);
    const [scheduleLoading, setScheduleLoading] = useState(true);
    const [selectedLesson, setSelectedLesson] = useState<FlatLesson | null>(null);
    const [currentPeriod, setCurrentPeriod] = useState<PeriodInfo | null>(null);
    const [weekPeriods, setWeekPeriods] = useState<PeriodInfo[]>([]);

    // Grades state
    const [gradesData, setGradesData] = useState<GradeRow[]>([]);
    const [finalGrades, setFinalGrades] = useState<unknown[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);

    // Works state
    const [worksData, setWorksData] = useState<Work[]>([]);
    const [worksLoading, setWorksLoading] = useState(false);
    const [worksFilter, setWorksFilter] = useState<WorkFilter>('all');

    // Analytics state
    const [analyticsData, setAnalyticsData] = useState<AnalyticsResponse | null>(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(false);

    const loadSchedule = useCallback(async () => {
        setScheduleLoading(true);
        try {
            const data = await api.get<DiaryResponse>(`/student/diary?week_offset=${weekOffset}`);
            const diary = data.diary || {};
            const flat: FlatLesson[] = [];
            for (let day = 0; day < 6; day++) {
                const dayData = diary[day];
                if (dayData?.lessons) {
                    dayData.lessons.forEach((l) => {
                        flat.push({ ...l, day_of_week: day + 1 });
                    });
                }
            }
            setFlatLessons(flat);
            setCurrentPeriod(data.current_period || null);
            setWeekPeriods(data.week_periods || []);
            if (data.week_start && data.week_end) {
                const start = new Date(data.week_start);
                const end = new Date(data.week_end);
                const label = weekOffset === 0
                    ? `${start.getDate()} ${MONTHS[start.getMonth()]} — ${end.getDate()} ${MONTHS[end.getMonth()]} (текущая)`
                    : `${start.getDate()} ${MONTHS[start.getMonth()]} — ${end.getDate()} ${MONTHS[end.getMonth()]}`;
                setWeekLabel(label);

                const dates: Date[] = [];
                for (let i = 0; i < 6; i++) {
                    const d = new Date(start);
                    d.setDate(d.getDate() + i);
                    dates.push(d);
                }
                setDayDates(dates);
            }
        } catch {
            showError('Ошибка загрузки расписания');
        } finally {
            setScheduleLoading(false);
        }
    }, [weekOffset, showError]);

    const loadWorks = useCallback(async () => {
        setWorksLoading(true);
        try {
            const data = await api.get<DiaryResponse>(`/student/diary?week_offset=${weekOffset}`);
            const diary = data.diary || {};
            const now = new Date();
            const works: Work[] = [];
            for (let day = 0; day < 6; day++) {
                const dayData = diary[day];
                if (dayData?.lessons) {
                    dayData.lessons.forEach((lesson) => {
                        (lesson.homework || []).forEach((hw) => {
                            const dueDate = hw.due_date ? new Date(hw.due_date) : null;
                            let status: Work['status'] = 'pending';
                            if (hw.completed) status = 'completed';
                            else if (dueDate && dueDate < now) status = 'overdue';
                            works.push({
                                id: hw.id,
                                title: hw.title,
                                description: hw.description,
                                subject: lesson.subject_name || 'Предмет',
                                due_date: hw.due_date,
                                status,
                            });
                        });
                    });
                }
            }
            setWorksData(works);
        } catch {
            showError('Ошибка загрузки работ');
        } finally {
            setWorksLoading(false);
        }
    }, [weekOffset, showError]);

    const loadAnalytics = useCallback(async () => {
        setAnalyticsLoading(true);
        try {
            const [analyticsRes, gradesRes, subjectsRes, finalsRes] = await Promise.all([
                api.get<AnalyticsResponse>('/student/grades/analytics'),
                api.get<GradesResponse>('/student/grades'),
                api.get<{ subjects: Subject[] }>('/subjects'),
                api.get<{ final_grades: unknown[] }>('/student/grades/finals')
            ]);
            setAnalyticsData(analyticsRes);
            setGradesData(gradesRes.grades || []);
            setSubjects(subjectsRes.subjects || []);
            setFinalGrades(finalsRes.final_grades || []);
        } catch {
            showError('Не удалось загрузить аналитику');
        } finally {
            setAnalyticsLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        if (currentView === 'schedule') {
            loadSchedule();
        } else if (currentView === 'grades' && !analyticsData) {
            loadAnalytics();
        } else if (currentView === 'works' && worksData.length === 0) {
            loadWorks();
        }
    }, [currentView, weekOffset, loadSchedule, loadWorks, loadAnalytics, worksData.length, analyticsData]);

    return {
        currentView, setCurrentView,
        weekOffset, setWeekOffset, weekLabel,
        dayDates, flatLessons, scheduleLoading, selectedLesson, setSelectedLesson,
        currentPeriod, weekPeriods,
        gradesData, finalGrades, subjects,
        worksData, worksLoading, worksFilter, setWorksFilter,
        analyticsData, analyticsLoading,
        loadSchedule, loadWorks, loadAnalytics
    };
}
