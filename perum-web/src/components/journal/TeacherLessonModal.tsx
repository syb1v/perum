import React, { useState, useEffect } from 'react';
import api from '@/lib/apiClient';
import { useToast } from '@/context/ToastContext';
import { JournalData, JournalStudent, Subject } from '@/types';
import GradeModal from './GradeModal';
import HomeworkModal from './HomeworkModal';
import ViewGradeModal from './ViewGradeModal';
import styles from './TeacherLessonModal.module.css';

interface HomeworkAttachmentInfo {
    id: number;
    filename?: string;
    url_link?: string;
}

interface HomeworkInfo {
    id: number;
    title: string;
    description: string;
    attachments?: HomeworkAttachmentInfo[];
}

interface TeacherLessonModalProps {
    classId: number;
    classNameStr: string;
    subjectId: number;
    subjectName: string;
    date: string; // YYYY-MM-DD
    homework: HomeworkInfo[];
    onClose: () => void;
    onUpdate: () => void;
    readonlyHomework?: boolean;
    readonlyGrades?: boolean;
}

export default function TeacherLessonModal({
    classId,
    classNameStr,
    subjectId,
    subjectName,
    date,
    homework,
    onClose,
    onUpdate,
    readonlyHomework = false,
    readonlyGrades = false
}: TeacherLessonModalProps) {
    const { showError } = useToast();

    const [loading, setLoading] = useState(true);
    const [journal, setJournal] = useState<JournalData | null>(null);
    const [localHomework, setLocalHomework] = useState<HomeworkInfo[]>(homework);

    // Modals
    const [gradeModalOpen, setGradeModalOpen] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<JournalStudent | null>(null);
    const [viewGradeId, setViewGradeId] = useState<number | null>(null);
    const [homeworkModalOpen, setHomeworkModalOpen] = useState(false);
    const [selectedHomework, setSelectedHomework] = useState<HomeworkInfo | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [journalData, hwData] = await Promise.all([
                api.get<JournalData>(`/journal/${classId}/${subjectId}`),
                api.get<{ homework: HomeworkInfo[] }>(`/teacher/homework?class_id=${classId}&subject_id=${subjectId}`)
            ]);
            setJournal(journalData);

            if (hwData && hwData.homework) {
                const todaysHw = hwData.homework.filter((hw: HomeworkInfo & { due_date?: string }) => hw.due_date?.startsWith(date));
                setLocalHomework(todaysHw);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Ошибка загрузки данных урока';
            showError(message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [classId, subjectId, date]);

    // Derived dummy subject since existing modals require Subject object
    const subjectPlaceholder = {
        id: subjectId,
        name: subjectName,
    } as Subject;

    const handleAddGradeClick = (student: JournalStudent) => {
        setSelectedStudent(student);
        setGradeModalOpen(true);
    };

    const handleDeleteAttachment = async (attachmentId: number) => {
        if (!confirm('Удалить вложение?')) return;
        try {
            await api.del(`/homework/attachments/${attachmentId}`);
            loadData();
        } catch {
            showError('Ошибка удаления вложения');
        }
    };

    const handleEditHomework = (hw: HomeworkInfo) => {
        setSelectedHomework(hw);
        setHomeworkModalOpen(true);
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const displayDate = new Date(date).toLocaleDateString('ru-RU', {
        weekday: 'long', day: 'numeric', month: 'long'
    });

    return (
        <div className={styles.overlay} onClick={handleBackdropClick}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <div>
                        <h2 className={styles.title}>{classNameStr}, {subjectName}</h2>
                        <p className={styles.subtitle}>{displayDate}</p>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div className={styles.body}>
                    {/* Homework Section */}
                    <div className={styles.sectionCard}>
                        <div className={styles.sectionHeader}>
                            <h3 className={styles.sectionTitle}>Домашнее задание</h3>
                            {!readonlyHomework && (
                                <button
                                    className={styles.addBtn}
                                    onClick={() => setHomeworkModalOpen(true)}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                    </svg>
                                    {localHomework.length ? 'Добавить ещё' : 'Задать'}
                                </button>
                            )}
                        </div>

                        {localHomework.length === 0 ? (
                            <div className={styles.emptyText}>Домашнее задание не задано</div>
                        ) : (
                            <div className={styles.homeworkList}>
                                {localHomework.map(hw => (
                                    <div key={hw.id} className={styles.homeworkItem}>
                                        <div className={styles.homeworkIcon}>
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                <polyline points="14 2 14 8 20 8"></polyline>
                                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                                <polyline points="10 9 9 9 8 9"></polyline>
                                            </svg>
                                        </div>
                                        <div className={styles.homeworkContent}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <h4 className={styles.homeworkTitle}>{hw.title}</h4>
                                                {!readonlyHomework && (
                                                    <button
                                                        onClick={() => handleEditHomework(hw)}
                                                        style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: '4px', fontSize: '0.85rem' }}
                                                        title="Редактировать задание"
                                                    >
                                                        Редактировать
                                                    </button>
                                                )}
                                            </div>
                                            {hw.description && <p className={styles.homeworkDesc}>{hw.description}</p>}
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
                                                            {!readonlyHomework && (
                                                                <button
                                                                    onClick={() => handleDeleteAttachment(att.id)}
                                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 4px' }}
                                                                    title="Удалить вложение"
                                                                >
                                                                    ✕
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Grades / Students List */}
                    <div className={styles.sectionCard}>
                        <div className={styles.sectionHeader}>
                            <h3 className={styles.sectionTitle}>Оценки и посещаемость</h3>
                        </div>

                        {loading ? (
                            <div className={styles.loadingText}>Загрузка списка учеников...</div>
                        ) : !journal ? (
                            <div className={styles.emptyText}>Не удалось загрузить данные</div>
                        ) : (
                            <div className={styles.studentsList}>
                                {journal.students.map((student, index) => {
                                    // Find grades for this specific date
                                    const todaysGrades = student.grades.filter(g => g.lesson_date === date);

                                    return (
                                        <div key={student.id} className={styles.studentRow}>
                                            <div className={styles.studentInfo}>
                                                <span className={styles.studentNum}>{index + 1}.</span>
                                                <span className={styles.studentName}>{student.last_name} {student.first_name}</span>
                                            </div>

                                            <div className={styles.studentGrades}>
                                                {todaysGrades.map(g => (
                                                    <span
                                                        key={g.id}
                                                        className={styles.gradeBadge}
                                                        style={{
                                                            backgroundColor: g.attendance_mark
                                                                ? (g.attendance_mark === 'НП' || g.attendance_mark === 'точка' ? '#fee2e2' : g.attendance_mark === 'УП' ? '#dcfce7' : '#dbeafe')
                                                                : (g.color || '#e5e7eb'), // Default active color
                                                            color: g.attendance_mark
                                                                ? (g.attendance_mark === 'НП' || g.attendance_mark === 'точка' ? '#dc2626' : g.attendance_mark === 'УП' ? '#16a34a' : '#2563eb')
                                                                : '#111827',
                                                            fontSize: g.attendance_mark === 'точка' ? '1.5rem' : '0.875rem',
                                                            lineHeight: g.attendance_mark === 'точка' ? '0.5' : '1'
                                                        }}
                                                        onClick={() => !readonlyGrades && setViewGradeId(g.id)}
                                                    >
                                                        {g.attendance_mark === 'точка' ? '•' : (g.attendance_mark || g.grade_value || g.value)}
                                                        {g.weight && g.weight !== 1.0 && !g.attendance_mark && (
                                                            <span style={{ fontSize: '0.65rem', marginLeft: '2px', opacity: 0.8 }}>
                                                                (x{g.weight})
                                                            </span>
                                                        )}
                                                    </span>
                                                ))}

                                                {!readonlyGrades && (
                                                    <button
                                                        className={styles.quickAddBtn}
                                                        onClick={() => handleAddGradeClick(student)}
                                                        title="Добавить оценку/посещаемость"
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                            <line x1="12" y1="5" x2="12" y2="19"></line>
                                                            <line x1="5" y1="12" x2="19" y2="12"></line>
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Inner Modals */}
            {gradeModalOpen && (
                <GradeModal
                    student={selectedStudent}
                    subject={subjectPlaceholder}
                    classId={classId}
                    date={date}
                    onClose={() => setGradeModalOpen(false)}
                    onSave={() => {
                        loadData();
                        onUpdate();
                    }}
                />
            )}

            {viewGradeId && (
                <ViewGradeModal
                    gradeId={viewGradeId}
                    onClose={() => setViewGradeId(null)}
                    onUpdate={() => {
                        loadData();
                        onUpdate();
                    }}
                />
            )}

            {homeworkModalOpen && (
                <HomeworkModal
                    classId={classId}
                    subjectId={subjectId}
                    classNameStr={classNameStr}
                    subjectName={subjectName}
                    defaultDueDate={date}
                    existingHomework={selectedHomework || undefined}
                    onClose={() => {
                        setHomeworkModalOpen(false);
                        setSelectedHomework(null);
                        loadData();
                        onUpdate();
                    }}
                    onDelete={() => {
                        setHomeworkModalOpen(false);
                        setSelectedHomework(null);
                        loadData();
                        onUpdate();
                    }}
                />
            )}
        </div>
    );
}
