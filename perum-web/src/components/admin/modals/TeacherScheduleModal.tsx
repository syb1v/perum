'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import styles from '@/app/admin/page.module.css';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';

import { polyfill } from 'mobile-drag-drop';
import { scrollBehaviourDragImageTranslateOverride } from 'mobile-drag-drop/scroll-behaviour';
import 'mobile-drag-drop/default.css';

interface ScheduleItem {
    id?: number;
    day_of_week: number;
    lesson_number: number;
    subject_id: number | null;
    subject_name?: string | null;
    class_id: number | null;
    class_name?: string | null;
    room: string | null;
    is_window?: boolean;
}

interface Subject {
    id: number;
    name: string;
}

interface ClassOption {
    id: number;
    name: string;
}

interface TeacherAssignment {
    id: number;
    subject: { id: number; name: string };
    class: { id: number; name: string };
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    teacherId: number | null;
    teacherName: string;
}

const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

export default function TeacherScheduleModal({ isOpen, onClose, teacherId, teacherName }: Props) {
    const { showSuccess, showError } = useToast();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [attemptedSave, setAttemptedSave] = useState(false);

    const [draggedItem, setDraggedItem] = useState<{ day: number; idx: number } | null>(null);
    const [dragOverItem, setDragOverItem] = useState<{ day: number; idx: number } | null>(null);

    const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [classes, setClasses] = useState<ClassOption[]>([]);
    const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);

    const fetchData = useCallback(async () => {
        if (!teacherId) return;
        setLoading(true);
        try {
            const [schedRes, subjRes, classRes, assignRes] = await Promise.all([
                api.get<{ schedule: Record<number, ScheduleItem[]> }>(`/admin/teachers/${teacherId}/schedule`),
                api.get<{ subjects: Subject[] }>('/subjects'),
                api.get<{ classes: ClassOption[] }>('/admin/classes'),
                api.get<{ assignments: TeacherAssignment[] }>(`/admin/teachers/${teacherId}/subjects`),
            ]);

            // Flatten grouped schedule into flat array
            const flat: ScheduleItem[] = [];
            for (const [dayStr, lessons] of Object.entries(schedRes.schedule)) {
                const day = parseInt(dayStr);
                for (const l of lessons) {
                    flat.push({ ...l, day_of_week: day });
                }
            }
            setSchedule(flat);
            setSubjects(subjRes.subjects);
            setClasses(classRes.classes);
            setAssignments(assignRes.assignments || []);
        } catch {
            showError('Не удалось загрузить расписание');
        } finally {
            setLoading(false);
        }
    }, [teacherId, showError]);

    useEffect(() => {
        polyfill({ dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride });
        const handleTouchMove = () => { };
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        return () => window.removeEventListener('touchmove', handleTouchMove);
    }, []);

    useEffect(() => {
        if (isOpen && teacherId) {
            setAttemptedSave(false);
            fetchData();
        } else {
            setSchedule([]);
            setAttemptedSave(false);
        }
    }, [isOpen, teacherId, fetchData]);

    const handleSave = async () => {
        if (!teacherId) return;

        setAttemptedSave(true);
        const invalidItems = schedule.filter(item => !item.is_window && (!item.subject_id || !item.class_id));
        if (invalidItems.length > 0) {
            showError(`Выберите предмет и класс для всех уроков (${invalidItems.length} не заполнено)`);
            return;
        }

        setSaving(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payloadItems: any[] = [];
            for (let d = 0; d < 6; d++) {
                const dayLessons = schedule
                    .filter(s => s.day_of_week === d)
                    .sort((a, b) => a.lesson_number - b.lesson_number);
                let lessonNum = 1;
                dayLessons.forEach((lesson) => {
                    if (lesson.is_window) {
                        lessonNum++; // skip number for window
                        return;
                    }
                    payloadItems.push({
                        subject_id: lesson.subject_id,
                        class_id: lesson.class_id,
                        day_of_week: lesson.day_of_week,
                        lesson_number: lessonNum,
                        room: lesson.room,
                    });
                    lessonNum++;
                });
            }

            await api.put(`/admin/teachers/${teacherId}/schedule`, { items: payloadItems });
            showSuccess('Расписание учителя сохранено!');
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка сохранения');
        } finally {
            setSaving(false);
        }
    };

    const updateScheduleItem = (index: number, field: keyof ScheduleItem, value: string | number | null) => {
        const newSchedule = [...schedule];
        newSchedule[index] = { ...newSchedule[index], [field]: value };
        setSchedule(newSchedule);
    };

    const deleteScheduleItem = (index: number) => {
        setSchedule(schedule.filter((_, i) => i !== index));
    };

    const addEmptyLesson = (dayOfWeek: number) => {
        const dayLessons = schedule.filter(s => s.day_of_week === dayOfWeek);
        const maxLesson = dayLessons.length > 0 ? Math.max(...dayLessons.map(s => s.lesson_number)) : 0;

        setSchedule([
            ...schedule,
            {
                day_of_week: dayOfWeek,
                lesson_number: maxLesson + 1,
                subject_id: null,
                class_id: null,
                room: null,
            },
        ]);
    };

    const addWindow = (dayOfWeek: number) => {
        const dayLessons = schedule.filter(s => s.day_of_week === dayOfWeek);
        const maxLesson = dayLessons.length > 0 ? Math.max(...dayLessons.map(s => s.lesson_number)) : 0;

        setSchedule([
            ...schedule,
            {
                day_of_week: dayOfWeek,
                lesson_number: maxLesson + 1,
                subject_id: null,
                class_id: null,
                room: null,
                is_window: true,
            },
        ]);
    };

    // Drag and drop handlers
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, dayIndex: number, originalIndex: number) => {
        setDraggedItem({ day: dayIndex, idx: originalIndex });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', originalIndex.toString());
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, dayIndex: number, originalIndex: number) => {
        e.preventDefault();
        if (draggedItem && draggedItem.day === dayIndex) {
            setDragOverItem({ day: dayIndex, idx: originalIndex });
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, dayIndex: number, dropOriginalIndex: number) => {
        e.preventDefault();
        if (draggedItem && draggedItem.day === dayIndex && draggedItem.idx !== dropOriginalIndex) {
            const newSchedule = [...schedule];
            const dayLessons = newSchedule
                .filter(s => s.day_of_week === dayIndex)
                .sort((a, b) => a.lesson_number - b.lesson_number);

            const dragVisualIdx = dayLessons.findIndex(s => newSchedule.indexOf(s) === draggedItem.idx);
            const dropVisualIdx = dayLessons.findIndex(s => newSchedule.indexOf(s) === dropOriginalIndex);

            if (dragVisualIdx !== -1 && dropVisualIdx !== -1) {
                const [draggedLesson] = dayLessons.splice(dragVisualIdx, 1);
                dayLessons.splice(dropVisualIdx, 0, draggedLesson);
                dayLessons.forEach((l, i) => {
                    l.lesson_number = i + 1;
                });
                const updatedSchedule = newSchedule
                    .filter(s => s.day_of_week !== dayIndex)
                    .concat(dayLessons);
                setSchedule(updatedSchedule);
            }
        }
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDragOverItem(null);
    };

    // Time rendering removed since time is now derived from bell_schedule

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Расписание: ${teacherName}`} size="xl" className={styles.scheduleModal}>
            <style>{`
                .tlesson-grid {
                    display: grid;
                    grid-template-columns: 24px 30px 1.2fr 1.2fr 80px 36px;
                    gap: 8px;
                    align-items: center;
                    padding: 8px;
                    border-radius: 8px;
                    transition: background-color 0.2s;
                }
                .tlesson-header {
                    display: grid;
                    grid-template-columns: 24px 30px 1.2fr 1.2fr 80px 36px;
                    gap: 8px;
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    padding: 0 8px;
                    margin-bottom: 8px;
                }
                .tlesson-time-room {
                    display: contents;
                }
                .tmobile-label {
                    display: none;
                    font-size: 0.70rem;
                    color: var(--text-secondary);
                    margin-bottom: 4px;
                }
                .tdrag-handle {
                    cursor: grab;
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.2rem;
                    user-select: none;
                    touch-action: none;
                }
                .tdrag-handle:active {
                    cursor: grabbing;
                }
                @media (max-width: 768px) {
                    .tlesson-grid, .tlesson-header {
                        grid-template-columns: 24px 30px 1fr 36px;
                        align-items: center;
                    }
                    .tlesson-selects {
                        display: grid;
                        grid-column: 1 / -1;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px;
                        margin-top: 4px;
                    }
                    .tlesson-time-room {
                        display: grid;
                        grid-column: 1 / -1;
                        grid-template-columns: 1fr;
                        gap: 8px;
                        margin-top: 4px;
                        padding-top: 8px;
                        border-top: 1px dashed var(--border-color);
                    }
                    .tlesson-delete {
                        order: 3;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                    .thide-on-mobile {
                        display: none !important;
                    }
                    .tmobile-label {
                        display: block;
                    }
                }
            `}</style>

            <div
                className={styles.modalBody}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    paddingRight: '8px',
                }}
            >
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>Загрузка...</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {DAYS.map((dayName, dayIndex) => {
                            const dayLessons = schedule
                                .filter(s => s.day_of_week === dayIndex)
                                .sort((a, b) => a.lesson_number - b.lesson_number);

                            return (
                                <div
                                    key={dayIndex}
                                    style={{
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '12px',
                                        padding: '16px',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            marginBottom: '16px',
                                        }}
                                    >
                                        <h4 style={{ color: 'var(--accent-primary)' }}>{dayName}</h4>
                                        <button
                                            onClick={() => addEmptyLesson(dayIndex)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                fontSize: '0.875rem',
                                            }}
                                        >
                                            + Урок
                                        </button>
                                        <button
                                            onClick={() => addWindow(dayIndex)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--text-muted, var(--text-secondary))',
                                                cursor: 'pointer',
                                                fontSize: '0.875rem',
                                            }}
                                        >
                                            + Окно
                                        </button>
                                    </div>

                                    {dayLessons.length === 0 ? (
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic' }}>
                                            Нет уроков
                                        </p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div className="tlesson-header">
                                                <div></div>
                                                <div>№</div>
                                                <div>Предмет</div>
                                                <div>Класс</div>
                                                <div className="thide-on-mobile">Каб.</div>
                                                <div></div>
                                            </div>
                                            {dayLessons.map((lesson, idx) => {
                                                const originalIndex = schedule.indexOf(lesson);
                                                const hasError =
                                                    attemptedSave && !lesson.is_window && (!lesson.subject_id || !lesson.class_id);
                                                const displayLessonNumber = idx + 1;

                                                const isDragged = draggedItem?.idx === originalIndex;
                                                const isDragOver = dragOverItem?.idx === originalIndex;

                                                return (
                                                    <div
                                                        key={`tlesson-${dayIndex}-${lesson.lesson_number}-${originalIndex}`}
                                                        className="tlesson-grid"
                                                        draggable
                                                        onDragStart={e => handleDragStart(e, dayIndex, originalIndex)}
                                                        onDragEnter={e => handleDragEnter(e, dayIndex, originalIndex)}
                                                        onDragOver={handleDragOver}
                                                        onDrop={e => handleDrop(e, dayIndex, originalIndex)}
                                                        onDragEnd={handleDragEnd}
                                                        style={{
                                                            backgroundColor: hasError
                                                                ? 'rgba(255, 69, 58, 0.1)'
                                                                : 'var(--bg-secondary)',
                                                            border: hasError
                                                                ? '1px solid rgba(255, 69, 58, 0.5)'
                                                                : isDragOver
                                                                    ? '1px dashed var(--accent-primary)'
                                                                    : '1px solid transparent',
                                                            opacity: isDragged ? 0.3 : 1,
                                                        }}
                                                    >
                                                        {/* Drag handle */}
                                                        <div className="tdrag-handle" title="Перетащите">
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                <div
                                                                    style={{
                                                                        width: '14px',
                                                                        height: '2px',
                                                                        backgroundColor: 'currentColor',
                                                                        borderRadius: '1px',
                                                                    }}
                                                                />
                                                                <div
                                                                    style={{
                                                                        width: '14px',
                                                                        height: '2px',
                                                                        backgroundColor: 'currentColor',
                                                                        borderRadius: '1px',
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* Lesson number */}
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontWeight: 'bold',
                                                            }}
                                                        >
                                                            {displayLessonNumber}
                                                        </div>

                                                        {lesson.is_window ? (
                                                            /* Window placeholder row */
                                                            <>
                                                                <div style={{
                                                                    gridColumn: 'span 2',
                                                                    textAlign: 'center',
                                                                    color: 'var(--text-muted, var(--text-secondary))',
                                                                    fontStyle: 'italic',
                                                                    fontSize: '0.85rem',
                                                                    padding: '4px 0',
                                                                }}>
                                                                    Окно
                                                                </div>
                                                                <div></div>
                                                            </>
                                                        ) : (
                                                            <>

                                                                <div className="tlesson-subject">
                                                                    {(() => {
                                                                        let allowedSubjects = subjects;
                                                                        if (assignments.length > 0) {
                                                                            if (lesson.class_id) {
                                                                                const assignedToClass = assignments.filter(a => a.class.id === lesson.class_id).map(a => a.subject.id);
                                                                                allowedSubjects = subjects.filter(s => assignedToClass.includes(s.id));
                                                                            } else {
                                                                                const allAssignedIds = Array.from(new Set(assignments.map(a => a.subject.id)));
                                                                                allowedSubjects = subjects.filter(s => allAssignedIds.includes(s.id));
                                                                            }
                                                                        }
                                                                        // Always include the current lesson's subject so existing schedule items are visible
                                                                        if (lesson.subject_id && !allowedSubjects.find(s => s.id === lesson.subject_id)) {
                                                                            const current = subjects.find(s => s.id === lesson.subject_id);
                                                                            if (current) allowedSubjects = [current, ...allowedSubjects];
                                                                        }

                                                                        return (
                                                                            <select
                                                                                value={lesson.subject_id || ''}
                                                                                onChange={e =>
                                                                                    updateScheduleItem(
                                                                                        originalIndex,
                                                                                        'subject_id',
                                                                                        e.target.value ? parseInt(e.target.value) : null
                                                                                    )
                                                                                }
                                                                                className={styles.input}
                                                                                style={{
                                                                                    padding: '4px 8px',
                                                                                    width: '100%',
                                                                                    borderColor: hasError && !lesson.subject_id ? 'var(--accent-red)' : '',
                                                                                }}
                                                                            >
                                                                                <option value="">Предмет...</option>
                                                                                {allowedSubjects.map(subj => (
                                                                                    <option key={subj.id} value={subj.id}>
                                                                                        {subj.name}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                        );
                                                                    })()}
                                                                </div>

                                                                <div className="tlesson-class">
                                                                    {(() => {
                                                                        let allowedClasses = classes;
                                                                        if (assignments.length > 0) {
                                                                            if (lesson.subject_id) {
                                                                                const assignedToSubject = assignments.filter(a => a.subject.id === lesson.subject_id).map(a => a.class.id);
                                                                                allowedClasses = classes.filter(c => assignedToSubject.includes(c.id));
                                                                            } else {
                                                                                const allAssignedIds = Array.from(new Set(assignments.map(a => a.class.id)));
                                                                                allowedClasses = classes.filter(c => allAssignedIds.includes(c.id));
                                                                            }
                                                                        }
                                                                        // Always include the current lesson's class so existing schedule items are visible
                                                                        if (lesson.class_id && !allowedClasses.find(c => c.id === lesson.class_id)) {
                                                                            const current = classes.find(c => c.id === lesson.class_id);
                                                                            if (current) allowedClasses = [current, ...allowedClasses];
                                                                        }

                                                                        return (
                                                                            <select
                                                                                value={lesson.class_id || ''}
                                                                                onChange={e =>
                                                                                    updateScheduleItem(
                                                                                        originalIndex,
                                                                                        'class_id',
                                                                                        e.target.value ? parseInt(e.target.value) : null
                                                                                    )
                                                                                }
                                                                                className={styles.input}
                                                                                style={{
                                                                                    padding: '4px 8px',
                                                                                    width: '100%',
                                                                                    borderColor: hasError && !lesson.class_id ? 'var(--accent-red)' : '',
                                                                                }}
                                                                            >
                                                                                <option value="">Класс...</option>
                                                                                {allowedClasses.map(c => (
                                                                                    <option key={c.id} value={c.id}>
                                                                                        {c.name}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                        );
                                                                    })()}
                                                                </div>

                                                                {/* Time & room */}
                                                                <div className="tlesson-time-room">
                                                                    <div>
                                                                        <div className="tmobile-label">Каб.</div>
                                                                        <input
                                                                            type="text"
                                                                            value={lesson.room || ''}
                                                                            onChange={e =>
                                                                                updateScheduleItem(
                                                                                    originalIndex,
                                                                                    'room',
                                                                                    e.target.value || null
                                                                                )
                                                                            }
                                                                            className={styles.input}
                                                                            placeholder="Каб."
                                                                            style={{ padding: '4px 8px', width: '100%' }}
                                                                        />
                                                                    </div>
                                                                </div>

                                                            </>
                                                        )}

                                                        {/* Delete */}
                                                        <button
                                                            className="tlesson-delete"
                                                            onClick={() => deleteScheduleItem(originalIndex)}
                                                            style={{
                                                                background: 'none',
                                                                border: 'none',
                                                                color: 'var(--accent-red)',
                                                                cursor: 'pointer',
                                                                padding: '4px',
                                                                fontSize: '1.2rem',
                                                            }}
                                                            title="Удалить"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )
                                    }
                                </div>
                            );
                        })}
                    </div>
                )}

                <div
                    className={styles.registerActions}
                    style={{
                        marginTop: '24px',
                        position: 'sticky',
                        bottom: 0,
                        backgroundColor: 'var(--bg-primary)',
                        padding: '16px 0',
                        borderTop: '1px solid var(--border-color)',
                    }}
                >
                    <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>
                        Закрыть
                    </button>
                    <button className={styles.btnPrimary} onClick={handleSave} disabled={saving || loading}>
                        {saving ? 'Сохранение...' : 'Применить'}
                    </button>
                </div>
            </div>
        </Modal >
    );
}
