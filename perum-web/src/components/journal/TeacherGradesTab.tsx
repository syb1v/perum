import React, { useMemo, useCallback } from 'react';
import { JournalData, JournalStudent, ClassInfo, Subject } from '@/types';
import JournalControls from '@/components/journal/JournalControls';
import GradeModal from '@/components/journal/GradeModal';
import ViewGradeModal from '@/components/journal/ViewGradeModal';
import HomeworkModal from '@/components/journal/HomeworkModal';
import FinalGradeModal from '@/components/journal/FinalGradeModal';
import AttestationModal from '@/components/journal/AttestationModal';
import DayTemplateModal from '@/components/journal/DayTemplateModal';
import ImportJournalModal from '@/components/journal/ImportJournalModal';
import styles from '../../app/teacher/journal/page.module.css';

export interface PeriodOption {
    id: number;
    name: string;
    period_type: string;
    start_date: string;
    end_date: string;
}

interface TeacherGradesTabProps {
    teacherClasses: ClassInfo[];
    selectedClassId: number;
    selectedSubjectId: number;
    selectedPeriodId: number;
    selectedDate: string;
    journal: JournalData | null;
    journalLoading: boolean;
    availableSubjects: Subject[];
    currentSubject: Subject | null;
    currentClass: ClassInfo | null;
    onClassChange: (id: number) => void;
    onSubjectChange: (id: number) => void;
    onPeriodChange: (id: number) => void;
    onLoad: (periodId?: number) => void;

    // Modal states
    gradeModalOpen: boolean;
    setGradeModalOpen: (v: boolean) => void;
    selectedStudentForGrade: JournalStudent | null;
    setSelectedStudentForGrade: (s: JournalStudent | null) => void;
    gradeDate: string;
    setGradeDate: (d: string) => void;

    viewGradeId: number | null;
    setViewGradeId: (id: number | null) => void;

    homeworkModalOpen: boolean;
    setHomeworkModalOpen: (v: boolean) => void;

    finalGradeModalOpen: boolean;
    setFinalGradeModalOpen: (v: boolean) => void;
    selectedStudentForFinalGrade: JournalStudent | null;
    setSelectedStudentForFinalGrade: (s: JournalStudent | null) => void;

    studentInfoModalOpen: boolean;
    setStudentInfoModalOpen: (v: boolean) => void;
    selectedStudentInfo: JournalStudent | null;
    setSelectedStudentInfo: (s: JournalStudent | null) => void;
}

export default function TeacherGradesTab({
    teacherClasses, selectedClassId, selectedSubjectId, selectedPeriodId,
    selectedDate, journal, journalLoading, availableSubjects,
    currentSubject, currentClass,
    onClassChange, onSubjectChange, onPeriodChange, onLoad,

    gradeModalOpen, setGradeModalOpen,
    selectedStudentForGrade, setSelectedStudentForGrade,
    gradeDate, setGradeDate,

    viewGradeId, setViewGradeId,
    homeworkModalOpen, setHomeworkModalOpen,

    finalGradeModalOpen, setFinalGradeModalOpen,
    selectedStudentForFinalGrade, setSelectedStudentForFinalGrade, studentInfoModalOpen, setStudentInfoModalOpen,
    selectedStudentInfo, setSelectedStudentInfo
}: TeacherGradesTabProps) {

    const [attestationModalOpen, setAttestationModalOpen] = React.useState(false);
    const [importModalOpen, setImportModalOpen] = React.useState(false);

    const storageKey = `dayTemplates_${selectedClassId}_${selectedSubjectId}`;
    const [dayTemplates, setDayTemplates] = React.useState<Record<string, { workTypeId: string, topicId: string, shortName: string }>>({});

    // Load templates from localStorage whenever the subject/class changes
    React.useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem(storageKey);
            setDayTemplates(saved ? JSON.parse(saved) : {});
        }
    }, [storageKey]);

    // Persist templates to localStorage when they change
    React.useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify(dayTemplates));
        }
    }, [dayTemplates, storageKey]);

    const [dayTemplateModalDate, setDayTemplateModalDate] = React.useState<string | null>(null);

    // Handlers
    const handleAddGradeClick = (student: JournalStudent, date: string) => {
        setSelectedStudentForGrade(student);
        setGradeDate(date);
        setGradeModalOpen(true);
    };

    const handleFinalGradeClick = (student: JournalStudent) => {
        if (!journal?.can_set_final_grade && !journal?.final_grades?.some(fg => fg.student_id === student.id)) return;
        setSelectedStudentForFinalGrade(student);
        setFinalGradeModalOpen(true);
    };

    // Dates processing
    const sortedDates = useMemo(() => {
        if (!journal) return [];

        const datesSet = new Set<string>();
        if (journal.dates) journal.dates.forEach((d: string) => datesSet.add(d));

        journal.students.forEach(s => {
            s.grades.forEach(g => {
                if (g.lesson_date) datesSet.add(g.lesson_date);
            });
        });

        return Array.from(datesSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    }, [journal]);

    const holidayDatesSet = useMemo(() => {
        const set = new Set<string>();
        if (!journal?.holiday_periods) return set;

        const allDates = new Set<string>();
        journal.dates?.forEach(d => allDates.add(d));
        journal.students?.forEach(s => s.grades?.forEach(g => {
            if (g.lesson_date) allDates.add(g.lesson_date);
        }));

        allDates.forEach(dateStr => {
            const d = new Date(dateStr);
            const isHoliday = journal.holiday_periods?.some(h => {
                const start = new Date(h.start_date);
                const end = new Date(h.end_date);
                return d >= start && d <= end;
            });
            if (isHoliday) set.add(dateStr);
        });
        return set;
    }, [journal]);

    const isHolidayDate = useCallback((date: string) => {
        return holidayDatesSet.has(date);
    }, [holidayDatesSet]);

    const sortedPeriods = useMemo(() => {
        if (!journal?.available_periods) return [];
        return (journal.available_periods as PeriodOption[])
            .filter(p => {
                const n = p.name.toLowerCase();
                return !n.includes('каникул');
            })
            .sort((a, b) => {
                const getOrderIndex = (name: string) => {
                    const n = name.toLowerCase();
                    if (n.includes('1 четверть')) return 1;
                    if (n.includes('2 четверть')) return 2;
                    if (n.includes('3 четверть')) return 3;
                    if (n.includes('4 четверть')) return 4;
                    if (n.includes('1 полугодие')) return 5;
                    if (n.includes('2 полугодие')) return 6;
                    if (n.includes('год') || n.includes('year')) return 7;
                    return 99;
                };
                return getOrderIndex(a.name) - getOrderIndex(b.name);
            });
    }, [journal]);

    const sortedStudents = useMemo(() => {
        if (!journal?.students) return [];
        return journal.students;
    }, [journal]);

    return (
        <div style={{ padding: '0 24px' }}>
            <JournalControls
                classes={teacherClasses as ClassInfo[]}
                subjects={availableSubjects}
                selectedClassId={selectedClassId}
                selectedSubjectId={selectedSubjectId}
                periods={sortedPeriods}
                selectedPeriodId={selectedPeriodId}
                onClassChange={onClassChange}
                onSubjectChange={onSubjectChange}
                onPeriodChange={onPeriodChange}
            >
                {!journalLoading && journal && !journal?.readonly && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            className={styles.btnHomework}
                            style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
                            onClick={() => setImportModalOpen(true)}
                            disabled={!selectedClassId || !selectedSubjectId}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                            Импорт
                        </button>
                        <button
                            className={styles.btnHomework}
                            onClick={() => setHomeworkModalOpen(true)}
                            disabled={!selectedClassId || !selectedSubjectId}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="12" y1="18" x2="12" y2="12" />
                                <line x1="9" y1="15" x2="15" y2="15" />
                            </svg>
                            Добавить Д/З
                        </button>
                    </div>
                )}
            </JournalControls>

            {journal?.current_period && (
                <div style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid var(--border-color)'
                }}>
                    <div>
                        <span style={{ fontWeight: 600, marginRight: '8px' }}>Текущий период:</span>
                        <span>{journal.current_period.name}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '14px', marginLeft: '12px' }}>
                            ({new Date(journal.current_period.start_date).toLocaleDateString()} — {new Date(journal.current_period.end_date).toLocaleDateString()})
                        </span>
                    </div>
                    {journal.can_set_final_grade && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff7ed', color: '#c2410c', padding: '6px 12px', borderRadius: '8px', fontSize: '14px', fontWeight: 500, border: '1px solid #fed7aa' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                                <span>Скоро аттестация</span>
                            </div>
                            {!journal.readonly && (
                                <button
                                    onClick={() => setAttestationModalOpen(true)}
                                    style={{
                                        backgroundColor: '#2563eb', color: 'white', padding: '6px 16px', borderRadius: '8px',
                                        fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                    Аттестация
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div className={styles.journalWrapper}>
                {journalLoading ? (
                    <div className={styles.journalLoading}>
                        <div className={styles.spinner}></div>
                        <span>Загрузка журнала...</span>
                    </div>
                ) : !journal ? (
                    <div className={styles.journalEmpty}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                        <p>Выберите класс и предмет для просмотра журнала</p>
                    </div>
                ) : (
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={`${styles.studentCol} ${styles.rowNum}`}>№</th>
                                    <th className={styles.studentCol}>Ученик</th>
                                    {sortedDates.map(date => {
                                        const cw = journal?.control_works?.find(w => w.work_date.startsWith(date));
                                        const isHoliday = isHolidayDate(date);
                                        const dt = dayTemplates[date];
                                        return (
                                            <th
                                                key={date}
                                                className={`${styles.gradeCol} ${date === selectedDate ? styles.gradeColToday : ''} ${isHoliday ? styles.gradeColHoliday : ''}`}
                                                title={isHoliday ? 'Каникулы' : 'Нажмите чтобы настроить шаблон дня'}
                                                style={{ cursor: 'pointer', position: 'relative' }}
                                                onClick={() => !isHoliday && setDayTemplateModalDate(date)}
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                    <span>{date.split('-').slice(1).reverse().join('.')}</span>
                                                    {dt ? (
                                                        <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 'bold' }}>
                                                            {dt.shortName}
                                                        </span>
                                                    ) : cw && (
                                                        <span
                                                            title={`${cw.work_type}: ${cw.title || 'Без темы'}`}
                                                            style={{
                                                                width: '6px', height: '6px', borderRadius: '50%',
                                                                backgroundColor: cw.work_type === 'контрольная' ? '#ef4444' : '#3b82f6'
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            </th>
                                        );
                                    })}
                                    <th className={styles.avgCol}>Ср.</th>
                                    <th className={styles.avgCol} title="Итоговая оценка за период" style={{ borderLeft: '2px solid var(--border-color)', backgroundColor: 'var(--bg-tertiary)' }}>Итог</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedStudents.map((student, index) => {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const gradesByDate: Record<string, any[]> = {};
                                    student.grades.forEach(g => {
                                        const d = g.lesson_date || 'no-date';
                                        if (!gradesByDate[d]) gradesByDate[d] = [];
                                        gradesByDate[d].push(g);
                                    });

                                    const avg = student.average;
                                    const avgClass =
                                        avg >= 4.5 ? styles.avgExcellent :
                                            avg >= 3.5 ? styles.avgGood :
                                                avg >= 2.5 ? styles.avgSatisfactory :
                                                    avg > 0 ? styles.avgBad : '';

                                    return (
                                        <tr key={student.id}>
                                            <td className={styles.rowNum}>{index + 1}</td>
                                            <td
                                                className={styles.studentName}
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => {
                                                    setSelectedStudentInfo(student);
                                                    setStudentInfoModalOpen(true);
                                                }}
                                            >
                                                {student.last_name} {student.first_name}
                                            </td>
                                            {sortedDates.map(date => {
                                                const grades = gradesByDate[date] || [];
                                                const isToday = date === selectedDate;
                                                const isHoliday = isHolidayDate(date);

                                                return (
                                                    <td
                                                        key={`${student.id}-${date}`}
                                                        className={`${styles.gradeCell} ${isToday ? styles.gradeCellToday : ''} ${isHoliday ? styles.gradeCellHoliday : ''}`}
                                                        onClick={() => {
                                                            if (grades.length === 0 && !isHoliday && !journal?.readonly) {
                                                                handleAddGradeClick(student, date);
                                                            }
                                                        }}
                                                        title={isHoliday ? 'Каникулы' : undefined}
                                                    >
                                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                                        {grades.map((g: any) => (
                                                            <span
                                                                key={g.id}
                                                                className={`${styles.gradeValue} ${g.attendance_mark
                                                                    ? styles.attendanceMark
                                                                    : (styles['grade' + (g.grade_value || g.value)] || '')
                                                                    }`}
                                                                style={{
                                                                    backgroundColor: g.attendance_mark
                                                                        ? (g.attendance_mark === 'НП' || g.attendance_mark === 'точка' ? '#fee2e2' : g.attendance_mark === 'УП' ? '#dcfce7' : '#dbeafe')
                                                                        : (!styles['grade' + (g.grade_value || g.value)] ? (g.color || '#ccc') : undefined),
                                                                    color: g.attendance_mark
                                                                        ? (g.attendance_mark === 'НП' || g.attendance_mark === 'точка' ? '#dc2626' : g.attendance_mark === 'УП' ? '#16a34a' : '#2563eb')
                                                                        : undefined,
                                                                    fontSize: g.attendance_mark === 'точка' ? '1.5rem' : undefined,
                                                                    lineHeight: g.attendance_mark === 'точка' ? '0.5' : undefined
                                                                }}
                                                                title={g.attendance_mark
                                                                    ? `${g.attendance_mark === 'УП' ? 'Уважительная причина' : g.attendance_mark === 'НП' ? 'Неуважительная причина' : g.attendance_mark === 'точка' ? 'Долг (Точка)' : 'Освобождён'}`
                                                                    : `${g.grade_type || 'Оценка'}${g.weight ? ` (x${g.weight})` : ''}: ${g.lesson_date ? g.lesson_date.split('-').reverse().join('.') : ''}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (!journal?.readonly) {
                                                                        setViewGradeId(g.id);
                                                                    }
                                                                }}
                                                            >
                                                                {g.attendance_mark === 'точка' ? '•' : (g.attendance_mark || g.grade_value || g.value)}
                                                            </span>
                                                        ))}
                                                        {!isHoliday && !journal?.readonly && (
                                                            <button
                                                                className={styles.addGradeBtn}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleAddGradeClick(student, date);
                                                                }}
                                                            >
                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                                    <line x1="12" y1="5" x2="12" y2="19" />
                                                                    <line x1="5" y1="12" x2="19" y2="12" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className={`${styles.avgCol} ${styles.avgValue} ${avgClass}`}>
                                                {avg ? avg.toFixed(2) : '—'}
                                            </td>
                                            <td
                                                className={`${styles.avgCol} ${styles.avgValue}`}
                                                style={{
                                                    borderLeft: '2px solid var(--border-color)',
                                                    backgroundColor: 'var(--bg-tertiary)',
                                                    cursor: (journal.can_set_final_grade && !journal.readonly) ? 'pointer' : 'default'
                                                }}
                                                onClick={() => {
                                                    if (!journal.readonly) handleFinalGradeClick(student);
                                                }}
                                                title={(journal.can_set_final_grade && !journal.readonly) ? "Выставить итоговую оценку" : "Выставление итоговых оценок сейчас недоступно"}
                                            >
                                                {(() => {
                                                    const fGrade = journal?.final_grades?.find(fg => fg.student_id === student.id);
                                                    if (fGrade) {
                                                        return (
                                                            <span className={`${styles.gradeValue} ${styles['grade' + fGrade.grade_value]}`} style={{ fontWeight: 'bold' }}>
                                                                {fGrade.grade_value}
                                                            </span>
                                                        );
                                                    }
                                                    if (journal?.can_set_final_grade) {
                                                        const recommended = Math.round(avg);
                                                        if (recommended > 0) {
                                                            return <span style={{ color: 'var(--text-secondary)', fontSize: '13px', opacity: 0.6 }}>{recommended}</span>;
                                                        }
                                                    }
                                                    return '—';
                                                })()}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modals */}
            {gradeModalOpen && (
                <GradeModal
                    student={selectedStudentForGrade}
                    subject={currentSubject || null}
                    classId={selectedClassId}
                    date={gradeDate || selectedDate}
                    defaultWorkTypeId={dayTemplates[gradeDate || selectedDate]?.workTypeId}
                    defaultTopicId={dayTemplates[gradeDate || selectedDate]?.topicId}
                    onClose={() => setGradeModalOpen(false)}
                    onSave={() => {
                        onLoad();
                    }}
                />
            )}

            {viewGradeId && (
                <ViewGradeModal
                    gradeId={viewGradeId}
                    onClose={() => setViewGradeId(null)}
                    onUpdate={() => {
                        onLoad();
                    }}
                />
            )}

            {homeworkModalOpen && (
                <HomeworkModal
                    classId={selectedClassId}
                    subjectId={selectedSubjectId}
                    classNameStr={currentClass?.name}
                    subjectName={currentSubject?.name}
                    onClose={() => setHomeworkModalOpen(false)}
                />
            )}

            {finalGradeModalOpen && (
                <FinalGradeModal
                    student={selectedStudentForFinalGrade}
                    subject={currentSubject || null}
                    classId={selectedClassId}
                    period={journal?.current_period || null}
                    existingGrade={
                        (() => {
                            const fg = journal?.final_grades?.find(fg => fg.student_id === selectedStudentForFinalGrade?.id);
                            return fg ? { value: fg.grade_value, type: fg.grade_type, comment: fg.comment || undefined } : null;
                        })()
                    }
                    recommendedGrade={selectedStudentForFinalGrade?.average || null}
                    onClose={() => setFinalGradeModalOpen(false)}
                    onSave={() => {
                        onLoad();
                    }}
                />
            )}

            {/* Student Info Modal */}
            {studentInfoModalOpen && selectedStudentInfo && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div style={{
                        background: 'var(--bg-card)', padding: '24px', borderRadius: '12px',
                        width: '100%', maxWidth: '400px', border: '1px solid var(--border-color)',
                        position: 'relative'
                    }}>
                        <button
                            onClick={() => setStudentInfoModalOpen(false)}
                            style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                        <h2 style={{ fontSize: '1.25rem', marginBottom: '16px', fontWeight: 600 }}>Информация об ученике</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>ФИО</span>
                                <span style={{ fontWeight: 500 }}>{selectedStudentInfo.last_name} {selectedStudentInfo.first_name}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Средний балл</span>
                                <span style={{ fontWeight: 500 }}>{selectedStudentInfo.average ? selectedStudentInfo.average.toFixed(2) : '—'}</span>
                            </div>
                        </div>
                        <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                            <button
                                onClick={() => setStudentInfoModalOpen(false)}
                                style={{
                                    flex: 1, padding: '10px', background: 'var(--bg-tertiary)',
                                    border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer',
                                    color: 'var(--text-primary)', fontWeight: 500
                                }}
                            >
                                Закрыть
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Attestation Full Modal */}
            {attestationModalOpen && journal?.current_period && selectedClassId && selectedSubjectId && (
                <AttestationModal
                    classId={selectedClassId}
                    subjectId={selectedSubjectId}
                    periodId={journal.current_period.id}
                    onClose={() => setAttestationModalOpen(false)}
                    onSuccess={() => {
                        setAttestationModalOpen(false);
                        onLoad();
                    }}
                />
            )}

            {dayTemplateModalDate && currentSubject && (
                <DayTemplateModal
                    date={dayTemplateModalDate}
                    subject={currentSubject}
                    initialWorkTypeId={dayTemplates[dayTemplateModalDate]?.workTypeId}
                    initialTopicId={dayTemplates[dayTemplateModalDate]?.topicId}
                    onClose={() => setDayTemplateModalDate(null)}
                    onClear={() => {
                        const newTemplates = { ...dayTemplates };
                        delete newTemplates[dayTemplateModalDate];
                        setDayTemplates(newTemplates);
                        setDayTemplateModalDate(null);
                    }}
                    onSave={(wtId, tId, shortName) => {
                        setDayTemplates({
                            ...dayTemplates,
                            [dayTemplateModalDate]: {
                                workTypeId: wtId,
                                topicId: tId,
                                shortName: shortName
                            }
                        });
                        setDayTemplateModalDate(null);
                    }}
                />
            )}
            {importModalOpen && selectedClassId && selectedSubjectId && (
                <ImportJournalModal 
                    classId={selectedClassId}
                    subjectId={selectedSubjectId}
                    onClose={() => setImportModalOpen(false)}
                    onSuccess={() => {
                        setImportModalOpen(false);
                        onLoad();
                    }}
                />
            )}
        </div>
    );
}
