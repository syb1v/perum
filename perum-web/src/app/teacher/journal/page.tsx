'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import { SkeletonCard } from '@/components/ui/Skeleton';
import type { JournalData, JournalStudent } from '@/types';
import TeacherGradesTab from '@/components/journal/TeacherGradesTab';
import TeacherScheduleTab from '@/components/journal/TeacherScheduleTab';
import TeacherLessonModal from '@/components/journal/TeacherLessonModal';
import TeacherWorksTab from '@/components/journal/TeacherWorksTab';
import styles from './page.module.css';

type ViewType = 'schedule' | 'grades' | 'works';

function TeacherJournalContent() {
    const { showError } = useToast();
    const searchParams = useSearchParams();

    // View State
    const [currentView, setCurrentView] = useState<ViewType>('schedule');

    // Status
    const [loading, setLoading] = useState(true);
    const [journalLoading, setJournalLoading] = useState(false);

    // Data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [teacherClasses, setTeacherClasses] = useState<any[]>([]);
    const [journal, setJournal] = useState<JournalData | null>(null);

    // Selection
    const [selectedClassId, setSelectedClassId] = useState<number>(0);
    const [selectedSubjectId, setSelectedSubjectId] = useState<number>(0);
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [selectedPeriodId, setSelectedPeriodId] = useState<number>(0);

    // Flag to prevent infinite auto-loading loops
    const [initialParamsLoaded, setInitialParamsLoaded] = useState(false);

    // Modals
    const [gradeModalOpen, setGradeModalOpen] = useState(false);
    const [selectedStudentForGrade, setSelectedStudentForGrade] = useState<JournalStudent | null>(null);
    const [gradeDate, setGradeDate] = useState<string>('');

    const [viewGradeId, setViewGradeId] = useState<number | null>(null);

    const [homeworkModalOpen, setHomeworkModalOpen] = useState(false);

    // Final Grade Modal
    const [finalGradeModalOpen, setFinalGradeModalOpen] = useState(false);
    const [selectedStudentForFinalGrade, setSelectedStudentForFinalGrade] = useState<JournalStudent | null>(null);

    // Student Info Modal
    const [studentInfoModalOpen, setStudentInfoModalOpen] = useState(false);
    const [selectedStudentInfo, setSelectedStudentInfo] = useState<JournalStudent | null>(null);

    // Lesson Modal for Schedule Tab
    const [lessonModalOpen, setLessonModalOpen] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [selectedLesson, setSelectedLesson] = useState<any>(null);
    const [selectedLessonDate, setSelectedLessonDate] = useState<string>('');
    const [scheduleRefreshTrigger, setScheduleRefreshTrigger] = useState(0);

    // Initial Load
    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        api.get<{ classes: any[] }>('/journal/teacher/subjects')
            .then(data => {
                const sortedClasses = (data.classes || []).sort((a, b) =>
                    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                );
                setTeacherClasses(sortedClasses);
            })
            .catch(() => {
                showError('Ошибка загрузки данных учителя');
            })
            .finally(() => setLoading(false));
    }, [showError]);

    // Derived state
    const availableSubjects = useMemo(() => {
        if (!selectedClassId) return [];
        const cls = teacherClasses.find(c => c.id === selectedClassId);
        return cls ? cls.subjects : [];
    }, [selectedClassId, teacherClasses]);

    const currentSubject = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return availableSubjects.find((s: any) => s.id === selectedSubjectId);
    }, [selectedSubjectId, availableSubjects]);

    const currentClass = useMemo(() => {
        return teacherClasses.find(c => c.id === selectedClassId);
    }, [selectedClassId, teacherClasses]);

    // Load Journal
    const loadJournal = useCallback(async (overridePeriodId?: number) => {
        if (!selectedClassId || !selectedSubjectId) return;

        setJournalLoading(true);
        try {
            const periodParam = overridePeriodId || selectedPeriodId;
            const url = periodParam
                ? `/journal/${selectedClassId}/${selectedSubjectId}?period_id=${periodParam}`
                : `/journal/${selectedClassId}/${selectedSubjectId}`;
            const data = await api.get<JournalData>(url);
            setJournal(data);
            if (data.current_period && !overridePeriodId && !selectedPeriodId) {
                setSelectedPeriodId(data.current_period.id);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Ошибка загрузки журнала';
            showError(message);
            setJournal(null);
        } finally {
            setJournalLoading(false);
        }
    }, [selectedClassId, selectedSubjectId, selectedPeriodId, showError]);

    // Auto-load from URL query parameters
    useEffect(() => {
        if (!loading && teacherClasses.length > 0 && !initialParamsLoaded) {
            const classIdParam = searchParams.get('classId');
            const subjectIdParam = searchParams.get('subjectId');
            const dateParam = searchParams.get('date');
            const viewParam = searchParams.get('view');

            if (viewParam === 'grades' || viewParam === 'works' || viewParam === 'schedule') {
                setCurrentView(viewParam as ViewType);
            } else if (classIdParam && subjectIdParam) {
                setCurrentView('grades'); // Auto-switch to grades if params are present without view query
            }

            if (classIdParam && subjectIdParam) {
                const queryClassId = parseInt(classIdParam, 10);
                const querySubjectId = parseInt(subjectIdParam, 10);

                const validClass = teacherClasses.find(c => c.id === queryClassId);
                if (validClass) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const validSubject = validClass.subjects?.find((s: any) => s.id === querySubjectId);

                    if (validSubject) {
                        setSelectedClassId(queryClassId);
                        setSelectedSubjectId(querySubjectId);
                        if (dateParam) {
                            setSelectedDate(dateParam);
                        }

                        setInitialParamsLoaded(true);
                        setJournalLoading(true);
                        api.get<JournalData>(`/journal/${queryClassId}/${querySubjectId}`)
                            .then(data => setJournal(data))
                            .catch(err => {
                                const message = err instanceof Error ? err.message : 'Ошибка загрузки журнала';
                                showError(message);
                                setJournal(null);
                            })
                            .finally(() => setJournalLoading(false));

                        return;
                    }
                }
            }
            setInitialParamsLoaded(true);
        }
    }, [loading, teacherClasses, searchParams, initialParamsLoaded, showError]);

    // Auto-load journal when class or subject is fully selected
    useEffect(() => {
        if (initialParamsLoaded && selectedClassId && selectedSubjectId && selectedPeriodId === 0) {
            loadJournal();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedClassId, selectedSubjectId, initialParamsLoaded]);

    // Synchronize state with URL so page refresh retains the view
    useEffect(() => {
        if (!initialParamsLoaded) return;
        const params = new URLSearchParams(window.location.search);
        let changed = false;
        
        if (currentView !== params.get('view')) {
            params.set('view', currentView);
            changed = true;
        }
        
        const classStr = selectedClassId ? selectedClassId.toString() : null;
        if (classStr !== params.get('classId')) {
            if (classStr) params.set('classId', classStr);
            else params.delete('classId');
            changed = true;
        }
        
        const subjectStr = selectedSubjectId ? selectedSubjectId.toString() : null;
        if (subjectStr !== params.get('subjectId')) {
            if (subjectStr) params.set('subjectId', subjectStr);
            else params.delete('subjectId');
            changed = true;
        }
        
        if (changed) {
            window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
        }
    }, [currentView, selectedClassId, selectedSubjectId, initialParamsLoaded]);

    // Handlers
    const handleClassChange = (id: number) => {
        setSelectedClassId(id);
        setSelectedSubjectId(0);
        setSelectedPeriodId(0);
        setJournal(null);
    };

    const handleSubjectChange = (id: number) => {
        setSelectedSubjectId(id);
        setSelectedPeriodId(0);
    };

    const handlePeriodChange = (id: number) => {
        setSelectedPeriodId(id);
        loadJournal(id);
    };


    if (loading) return <div style={{ padding: '20px' }}><SkeletonCard /></div>;

    return (
        <div className={styles.journalLayout}>
            {/* Header / Tabs Container */}
            <div className={styles.tabsWrapper}>
                {/* Main Tabs */}
                <div className={styles.tabsHeader}>
                    <button
                        className={`${styles.tabBtn} ${currentView === 'schedule' ? styles.activeTab : ''}`}
                        onClick={() => setCurrentView('schedule')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <span className={styles.desktopText}>Личное расписание</span>
                        <span className={styles.mobileText}>Расписание</span>
                    </button>
                    <button
                        className={`${styles.tabBtn} ${currentView === 'grades' ? styles.activeTab : ''}`}
                        onClick={() => setCurrentView('grades')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="20" x2="12" y2="10" />
                            <line x1="18" y1="20" x2="18" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="16" />
                        </svg>
                        <span>Оценки</span>
                    </button>
                    <button
                        className={`${styles.tabBtn} ${currentView === 'works' ? styles.activeTab : ''}`}
                        onClick={() => setCurrentView('works')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                        <span>Работы</span>
                    </button>
                </div>
            </div>

            {/* Lesson Modal from Schedule */}
            {lessonModalOpen && selectedLesson && (
                <TeacherLessonModal
                    classId={selectedLesson.class_id}
                    classNameStr={selectedLesson.class_name}
                    subjectId={selectedLesson.subject_id}
                    subjectName={selectedLesson.subject_name}
                    date={selectedLessonDate}
                    homework={selectedLesson.homework || []}
                    onClose={() => setLessonModalOpen(false)}
                    onUpdate={() => {
                        setScheduleRefreshTrigger(prev => prev + 1);
                    }}
                    readonlyHomework={false}
                    readonlyGrades={true}
                />
            )}

            {/* Content Area */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {currentView === 'schedule' && (
                    <TeacherScheduleTab
                        refreshTrigger={scheduleRefreshTrigger}
                        onLessonSelect={(lesson, date) => {
                            setSelectedLesson(lesson);
                            setSelectedLessonDate(date);
                            setLessonModalOpen(true);
                        }}
                    />
                )}

                {currentView === 'grades' && (
                    <div className={styles.journalPage} style={{ paddingTop: '20px' }}>
                        <TeacherGradesTab
                            teacherClasses={teacherClasses}
                            selectedClassId={selectedClassId}
                            selectedSubjectId={selectedSubjectId}
                            selectedPeriodId={selectedPeriodId}
                            selectedDate={selectedDate}
                            journal={journal}
                            journalLoading={journalLoading}
                            availableSubjects={availableSubjects}
                            currentSubject={currentSubject || null}
                            currentClass={currentClass || null}
                            onClassChange={handleClassChange}
                            onSubjectChange={handleSubjectChange}
                            onPeriodChange={handlePeriodChange}
                            onLoad={loadJournal}
                            gradeModalOpen={gradeModalOpen}
                            setGradeModalOpen={setGradeModalOpen}
                            selectedStudentForGrade={selectedStudentForGrade}
                            setSelectedStudentForGrade={setSelectedStudentForGrade}
                            gradeDate={gradeDate}
                            setGradeDate={setGradeDate}
                            viewGradeId={viewGradeId}
                            setViewGradeId={setViewGradeId}
                            homeworkModalOpen={homeworkModalOpen}
                            setHomeworkModalOpen={setHomeworkModalOpen}
                            finalGradeModalOpen={finalGradeModalOpen}
                            setFinalGradeModalOpen={setFinalGradeModalOpen}
                            selectedStudentForFinalGrade={selectedStudentForFinalGrade}
                            setSelectedStudentForFinalGrade={setSelectedStudentForFinalGrade}
                            studentInfoModalOpen={studentInfoModalOpen}
                            setStudentInfoModalOpen={setStudentInfoModalOpen}
                            selectedStudentInfo={selectedStudentInfo}
                            setSelectedStudentInfo={setSelectedStudentInfo}
                        />
                    </div>
                )}

                {currentView === 'works' && (
                    <div style={{ padding: '20px 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <TeacherWorksTab
                            classes={teacherClasses}
                            subjects={availableSubjects}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

export default function TeacherJournal() {
    return (
        <Suspense fallback={<div style={{ padding: '20px' }}><SkeletonCard /></div>}>
            <TeacherJournalContent />
        </Suspense>
    );
}
