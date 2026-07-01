'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Modal from '@/components/ui/Modal';
import LessonGroupsEditor from './LessonGroupsEditor';
import styles from '@/app/admin/page.module.css';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';

import { polyfill } from 'mobile-drag-drop';
import { scrollBehaviourDragImageTranslateOverride } from 'mobile-drag-drop/scroll-behaviour';
import 'mobile-drag-drop/default.css';

export interface GroupData {
    id?: number;
    tempId: string;
    name: string;
    room: string | null;
    teacher_id?: number | null;
    student_ids: number[];
}

export interface User {
    id: number;
    login: string;
    first_name?: string | null;
    last_name?: string | null;
    patronymic?: string | null;
}

interface ScheduleItem {
    id?: number;
    day_of_week: number;
    lesson_number: number;
    subject_id: number | null;
    subject_raw?: string;
    subject?: { id: number; name: string };
    subject_name?: string;
    teacher_id?: number | null;
    teacher?: { id: number; name: string } | null;
    room: string | null;
    groups?: GroupData[];
}

interface Subject {
    id: number;
    name: string;
}

interface ClassScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    classId: number | null;
    classNameStr: string;
}

const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

export default function ClassScheduleModal({ isOpen, onClose, classId, classNameStr }: ClassScheduleModalProps) {
    const { showSuccess, showError } = useToast();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [attemptedSave, setAttemptedSave] = useState(false);

    const [draggedItem, setDraggedItem] = useState<{ day: number, idx: number } | null>(null);
    const [dragOverItem, setDragOverItem] = useState<{ day: number, idx: number } | null>(null);

    const [groupsModalOpen, setGroupsModalOpen] = useState(false);
    const [selectedLessonForGroups, setSelectedLessonForGroups] = useState<number | null>(null);

    const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [classStudents, setClassStudents] = useState<User[]>([]);
    const [teachers, setTeachers] = useState<User[]>([]);
    const [subjectTeachers, setSubjectTeachers] = useState<User[]>([]);


    const fetchData = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        try {
            const [schedRes, subjRes, studentsRes, teachersRes] = await Promise.all([
                api.get<{ schedule: ScheduleItem[] }>(`/admin/classes/${classId}/schedule`),
                api.get<{ subjects: Subject[] }>('/subjects'),
                api.get<{ students: User[] }>(`/admin/classes/${classId}/students`),
                api.get<{ users: User[] }>('/admin/users?role=teacher')
            ]);

            // For each loaded schedule item's groups, ensure they have a tempId for UI
            const processedSchedule = schedRes.schedule.map((item) => {
                if (item.groups) {
                    item.groups = item.groups.map(g => ({ ...g, tempId: g.id ? String(g.id) : Math.random().toString(36).substr(2, 9) }));
                }
                return item;
            });

            setSchedule(processedSchedule);
            setSubjects(subjRes.subjects);
            setClassStudents(studentsRes.students || []);
            setTeachers(teachersRes.users || []);
        } catch (error) {
            console.error(error);
            showError('Не удалось загрузить расписание');
        } finally {
            setLoading(false);
        }
    }, [classId, showError]);

    useEffect(() => {
        polyfill({
            dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride
        });

        const handleTouchMove = () => { };
        window.addEventListener('touchmove', handleTouchMove, { passive: false });
        return () => window.removeEventListener('touchmove', handleTouchMove);
    }, []);

    useEffect(() => {
        if (isOpen && classId) {
            setAttemptedSave(false);
            fetchData();
        } else {
            setSchedule([]);
            setAttemptedSave(false);
        }
    }, [isOpen, classId, fetchData]);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !classId) return;

        const formData = new FormData();
        formData.append('file', file);

        setLoading(true);
        try {
            const response = await fetch(`/api/admin/classes/${classId}/schedule/upload`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Ошибка загрузки файла');
            }

            if (data.success) {
                setSchedule(data.items);
                showSuccess(`Распознано уроков: ${data.total_parsed}`);
                if (data.unmapped > 0) {
                    showError(`${data.unmapped} предметов нужно распознать вручную (подсвечены красным)`);
                }
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                showError(error.message);
            } else {
                showError('Ошибка обработки файла');
            }
        } finally {
            setLoading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleSave = async () => {
        if (!classId) return;

        setAttemptedSave(true);
        const invalidItems = schedule.filter(item => !item.subject_id && !item.subject?.id);
        if (invalidItems.length > 0) {
            showError(`Выберите предметы из списка для всех уроков (${invalidItems.length} не выбрано)`);
            return;
        }

        setSaving(true);
        try {
            const payloadItems = schedule.map((lesson) => {
                const mappedGroups = (lesson.groups && lesson.groups.length > 0) ? lesson.groups.map(g => ({
                    name: g.name,
                    room: g.room || null,
                    teacher_id: g.teacher_id || null,
                    student_ids: Array.isArray(g.student_ids) ? g.student_ids : []
                })) : [];

                return {
                    subject_id: lesson.subject_id || lesson.subject?.id,
                    day_of_week: Number(lesson.day_of_week),
                    lesson_number: Number(lesson.lesson_number),
                    room: mappedGroups.length > 0 ? null : (lesson.room || null),
                    groups: mappedGroups.length > 0 ? mappedGroups : undefined
                };
            });

            const payload = { items: payloadItems };
            await api.put(`/admin/classes/${classId}/schedule`, payload);
            showSuccess('Расписание сохранено!');
        } catch (error: unknown) {
            console.error("Save error:", error);
            const err = error as { message?: string };
            showError(`Ошибка сохранения: ${err?.message || String(error)}`);
        } finally {
            setSaving(false);
        }
    };

    const updateScheduleItem = (index: number, field: keyof ScheduleItem, value: string | number | null) => {
        const newSchedule = [...schedule];
        newSchedule[index] = { ...newSchedule[index], [field]: value };
        // Clear raw subject name if we manually picked a subject ID
        if (field === 'subject_id') {
            newSchedule[index].subject_raw = '';
        }
        setSchedule(newSchedule);
    };

    const deleteScheduleItem = (index: number) => {
        setSchedule(schedule.filter((_, i) => i !== index));
    };

    const addEmptyLesson = (dayOfWeek: number) => {
        const dayLessons = schedule.filter(s => s.day_of_week === dayOfWeek);
        const maxLesson = dayLessons.length > 0 ? Math.max(...dayLessons.map(s => s.lesson_number)) : 0;

        setSchedule([...schedule, {
            day_of_week: dayOfWeek,
            lesson_number: maxLesson + 1,
            subject_id: null,
            room: null
        }]);
    };

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, dayIndex: number, originalIndex: number) => {
        setDraggedItem({ day: dayIndex, idx: originalIndex });
        e.dataTransfer.effectAllowed = 'move';
        // Required for Firefox
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
            const dayLessons = newSchedule.filter(s => s.day_of_week === dayIndex).sort((a, b) => a.lesson_number - b.lesson_number);

            const dragVisualIdx = dayLessons.findIndex(s => newSchedule.indexOf(s) === draggedItem.idx);
            const dropVisualIdx = dayLessons.findIndex(s => newSchedule.indexOf(s) === dropOriginalIndex);

            if (dragVisualIdx !== -1 && dropVisualIdx !== -1) {
                const [draggedLesson] = dayLessons.splice(dragVisualIdx, 1);
                dayLessons.splice(dropVisualIdx, 0, draggedLesson);

                dayLessons.forEach((l, i) => {
                    l.lesson_number = i + 1;
                });

                const updatedSchedule = newSchedule.filter(s => s.day_of_week !== dayIndex).concat(dayLessons);
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

    // --- GROUP MODAL LOGIC ---
    const handleGroupsSave = async (groups: GroupData[]) => {
        if (selectedLessonForGroups === null) return;

        const newSchedule = [...schedule];
        newSchedule[selectedLessonForGroups] = {
            ...newSchedule[selectedLessonForGroups],
            groups: groups
        };
        setSchedule(newSchedule);
        setGroupsModalOpen(false);

        // Автоматически сохраняем всё расписание на сервер
        if (!classId) return;
        try {
            const payloadItems = newSchedule.map((lesson) => {
                const mappedGroups = (lesson.groups && lesson.groups.length > 0) ? lesson.groups.map(g => ({
                    name: g.name,
                    room: g.room || null,
                    teacher_id: g.teacher_id || null,
                    student_ids: Array.isArray(g.student_ids) ? g.student_ids : []
                })) : [];

                return {
                    subject_id: lesson.subject_id || lesson.subject?.id,
                    day_of_week: Number(lesson.day_of_week),
                    lesson_number: Number(lesson.lesson_number),
                    room: mappedGroups.length > 0 ? null : (lesson.room || null),
                    groups: mappedGroups.length > 0 ? mappedGroups : undefined
                };
            });

            await api.put(`/admin/classes/${classId}/schedule`, { items: payloadItems });
            showSuccess('Подгруппы сохранены!');
        } catch (error: unknown) {
            console.error("Auto-save error:", error);
            const err = error as { message?: string };
            showError(`Ошибка сохранения подгрупп: ${err?.message || String(error)}`);
        }
    };

    const getGroupsForSelectedLesson = () => {
        if (selectedLessonForGroups === null) return [];
        const lesson = schedule[selectedLessonForGroups];
        if (lesson.groups && lesson.groups.length > 0) return lesson.groups;

        // Default 2 empty groups
        return [
            { tempId: Math.random().toString(36).substr(2, 9), name: 'Группа 1', room: lesson.room, student_ids: [] },
            { tempId: Math.random().toString(36).substr(2, 9), name: 'Группа 2', room: '', student_ids: [] }
        ];
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Расписание класса ${classNameStr}`}
            size="xl"
            className={styles.scheduleModal}
        >
            <style>{`
                .lesson-grid {
                    display: grid;
                    grid-template-columns: 24px 30px 1.2fr 70px 90px 40px;
                    gap: 12px;
                    align-items: center;
                    padding: 8px;
                    border-radius: 8px;
                    transition: background-color 0.2s;
                }
                .lesson-header {
                    display: grid;
                    grid-template-columns: 24px 30px 1.2fr 70px 90px 40px;
                    gap: 12px;
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    padding: 0 8px 8px 8px;
                    margin-bottom: 8px;
                    border-bottom: 1px solid var(--border-color);
                }
                .lesson-time-room {
                    display: contents;
                }
                .mobile-label {
                    display: none;
                    font-size: 0.70rem;
                    color: var(--text-secondary);
                    margin-bottom: 4px;
                }
                .drag-handle {
                    cursor: grab;
                    color: var(--text-secondary);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.2rem;
                    user-select: none;
                    touch-action: none;
                }
                .drag-handle:active {
                    cursor: grabbing;
                }
                @media (max-width: 768px) {
                    .lesson-grid, .lesson-header {
                        grid-template-columns: 18px 22px 1fr 30px;
                        gap: 8px;
                        align-items: center;
                    }
                    .lesson-time-room {
                        display: flex;
                        align-items: flex-end;
                        grid-column: 1 / -1;
                        gap: 16px;
                        margin-top: 4px;
                        padding-top: 12px;
                        border-top: 1px dashed var(--border-color);
                        order: 4;
                    }
                    .lesson-delete {
                        order: 3;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                    }
                    .hide-on-mobile {
                        display: none !important;
                    }
                    .mobile-label {
                        display: block;
                    }
                }
            `}</style>
            <div className={styles.modalBody} style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px' }}>
                    <div>
                        <h4 style={{ marginBottom: '4px' }}>Импорт из файла</h4>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                            Поддерживаются форматы Excel (.xlsx) и PDF. Текущее расписание будет заменено в окне предпросмотра.
                        </p>
                    </div>
                    <div>
                        <input
                            type="file"
                            accept=".xlsx, .xls, .pdf"
                            style={{ display: 'none' }}
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            disabled={loading || saving}
                        />
                        <button
                            className={styles.btnSecondary}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={loading || saving}
                        >
                            {loading ? 'Обработка...' : 'Загрузить файл'}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>Загрузка...</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {DAYS.map((dayName, dayIndex) => {
                            const dayLessons = schedule.filter(s => s.day_of_week === dayIndex).sort((a, b) => a.lesson_number - b.lesson_number);

                            return (
                                <div key={dayIndex} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <h4 style={{ color: 'var(--accent-primary)' }}>{dayName}</h4>
                                        <button
                                            onClick={() => addEmptyLesson(dayIndex)}
                                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem' }}
                                        >
                                            + Добавить урок
                                        </button>
                                    </div>

                                    {dayLessons.length === 0 ? (
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', fontStyle: 'italic' }}>Нет уроков</p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div className="lesson-header">
                                                <div></div>
                                                <div>№</div>
                                                <div>Предмет</div>
                                                <div className="hide-on-mobile">Каб.</div>
                                                <div className="hide-on-mobile">Подгруппы</div>
                                                <div></div>
                                            </div>
                                            {dayLessons.map((lesson, idx) => {
                                                const originalIndex = schedule.indexOf(lesson);
                                                const currentSubjectId = lesson.subject_id || lesson.subject?.id || '';
                                                const isParsedError = !!lesson.subject_raw && !currentSubjectId;
                                                const hasError = isParsedError || (attemptedSave && !currentSubjectId);
                                                const displayLessonNumber = idx + 1;

                                                const isDragged = draggedItem?.idx === originalIndex;
                                                const isDragOver = dragOverItem?.idx === originalIndex;

                                                return (
                                                    <div
                                                        key={`lesson-${dayIndex}-${lesson.lesson_number}-${originalIndex}`}
                                                        className="lesson-grid"
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, dayIndex, originalIndex)}
                                                        onDragEnter={(e) => handleDragEnter(e, dayIndex, originalIndex)}
                                                        onDragOver={handleDragOver}
                                                        onDrop={(e) => handleDrop(e, dayIndex, originalIndex)}
                                                        onDragEnd={handleDragEnd}
                                                        style={{
                                                            backgroundColor: hasError ? 'rgba(255, 69, 58, 0.1)' : 'var(--bg-secondary)',
                                                            border: hasError ? '1px solid rgba(255, 69, 58, 0.5)' :
                                                                (isDragOver ? '1px dashed var(--accent-primary)' : '1px solid transparent'),
                                                            opacity: isDragged ? 0.3 : 1
                                                        }}
                                                    >
                                                        <div className="drag-handle" title="Перетащите для изменения порядка">
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                <div style={{ width: '14px', height: '2px', backgroundColor: 'currentColor', borderRadius: '1px' }} />
                                                                <div style={{ width: '14px', height: '2px', backgroundColor: 'currentColor', borderRadius: '1px' }} />
                                                            </div>
                                                        </div>

                                                        <div className="lesson-number" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                                            {displayLessonNumber}
                                                        </div>

                                                        <div className="lesson-subject" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            {isParsedError && (
                                                                <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)' }}>
                                                                    Распознано: &quot;{lesson.subject_raw}&quot; - Выберите предмет
                                                                </span>
                                                            )}
                                                            <select
                                                                value={currentSubjectId}
                                                                onChange={(e) => updateScheduleItem(originalIndex, 'subject_id', e.target.value ? parseInt(e.target.value) : null)}
                                                                className={styles.input}
                                                                style={{ padding: '4px 8px', width: '100%', borderColor: hasError ? 'var(--accent-red)' : '' }}
                                                            >
                                                                <option value="">Выберите предмет...</option>
                                                                {subjects.map(subj => (
                                                                    <option key={subj.id} value={subj.id}>{subj.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        <div className="lesson-time-room">
                                                            <div>
                                                                <div className="mobile-label">Каб.</div>
                                                                {lesson.groups && lesson.groups.length > 0 ? (
                                                                    <div className={styles.input} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '4px 8px', cursor: 'default', minHeight: '34px', width: '70px', maxWidth: '100%', boxSizing: 'border-box' }}>
                                                                        {lesson.groups!.map((g, gi) => (
                                                                            <React.Fragment key={gi}>
                                                                                <span>{g.room || '?'}</span>
                                                                                {gi < lesson.groups!.length - 1 && <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--text-muted)' }}></div>}
                                                                            </React.Fragment>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <input
                                                                        type="text"
                                                                        value={lesson.room || ''}
                                                                        onChange={(e) => updateScheduleItem(originalIndex, 'room', e.target.value || null)}
                                                                        className={styles.input}
                                                                        placeholder="Каб."
                                                                        style={{ padding: '4px 8px', width: '70px', maxWidth: '100%', minHeight: '34px', boxSizing: 'border-box' }}
                                                                    />
                                                                )}
                                                            </div>
                                                            <div className="lesson-groups" style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                                                                <button
                                                                    className={styles.btnSecondary}
                                                                    style={{ padding: '0 12px', fontSize: '0.85rem', whiteSpace: 'nowrap', height: '34px', boxSizing: 'border-box' }}
                                                                    onClick={async () => {
                                                                        setSelectedLessonForGroups(originalIndex);
                                                                        // Fetch teachers specific to lesson's subject
                                                                        const subjectId = lesson.subject_id || lesson.subject?.id;
                                                                        if (subjectId) {
                                                                            try {
                                                                                const res = await api.get<{ teachers: { id: number; name: string }[] }>(`/admin/teachers-by-subject/${subjectId}`);
                                                                                // Convert to User format
                                                                                const subjTeachers = res.teachers.map(t => {
                                                                                    const parts = t.name.split(' ');
                                                                                    return { id: t.id, login: '', last_name: parts[0] || '', first_name: parts[1] || '', patronymic: parts[2] || '' };
                                                                                });
                                                                                setSubjectTeachers(subjTeachers.length > 0 ? subjTeachers : teachers);
                                                                            } catch {
                                                                                setSubjectTeachers(teachers);
                                                                            }
                                                                        } else {
                                                                            setSubjectTeachers(teachers);
                                                                        }
                                                                        setGroupsModalOpen(true);
                                                                    }}
                                                                >
                                                                    Подгруппы
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <button
                                                            className="lesson-delete"
                                                            onClick={() => deleteScheduleItem(originalIndex)}
                                                            style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '4px', fontSize: '1.2rem', gridColumn: 'auto' }}
                                                            title="Удалить"
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className={styles.registerActions} style={{ marginTop: '24px', position: 'sticky', bottom: 0, backgroundColor: 'var(--bg-primary)', padding: '16px 0', borderTop: '1px solid var(--border-color)' }}>
                    <button
                        className={styles.btnSecondary}
                        onClick={onClose}
                        disabled={saving}
                    >
                        Закрыть
                    </button>
                    <button
                        className={styles.btnPrimary}
                        onClick={handleSave}
                        disabled={saving || loading}
                    >
                        {saving ? 'Сохранение...' : 'Сохранить расписание'}
                    </button>
                </div>
            </div>

            <Modal
                isOpen={groupsModalOpen}
                onClose={() => setGroupsModalOpen(false)}
                title=""
                size="xxl"
                bodyFlex={true}
            >
                {groupsModalOpen && selectedLessonForGroups !== null && (
                    <LessonGroupsEditor
                        initialGroups={getGroupsForSelectedLesson()}
                        allStudents={classStudents}
                        teachers={subjectTeachers.length > 0 ? subjectTeachers : teachers}
                        onSave={handleGroupsSave}
                        onCancel={() => setGroupsModalOpen(false)}
                    />
                )}
            </Modal>
        </Modal>
    );
}
