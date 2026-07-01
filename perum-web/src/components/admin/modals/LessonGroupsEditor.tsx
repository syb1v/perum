'use client';

import React, { useState, useEffect } from 'react';
import styles from '@/app/admin/page.module.css';
import { GroupData, User } from './ClassScheduleModal';

interface LessonGroupsEditorProps {
    initialGroups: GroupData[];
    allStudents: User[];
    teachers: User[];
    onSave: (groups: GroupData[]) => void;
    onCancel: () => void;
}

export default function LessonGroupsEditor({ initialGroups, allStudents, teachers, onSave, onCancel }: LessonGroupsEditorProps) {
    const [groups, setGroups] = useState<GroupData[]>([]);
    const [availableStudents, setAvailableStudents] = useState<User[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [draggedStudent, setDraggedStudent] = useState<{ studentId: number; sourceGroupId: string | null } | null>(null);

    // Mobile detection
    const [isMobile, setIsMobile] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('available');
    const [dragOverTab, setDragOverTab] = useState<string | null>(null);

    // Mobile tap-to-move state
    const [selectedStudentMobile, setSelectedStudentMobile] = useState<{ studentId: number; sourceGroupId: string | null } | null>(null);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        setIsMobile(mq.matches);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    useEffect(() => {
        const copiedGroups = initialGroups.map(g => ({ ...g, student_ids: [...g.student_ids] }));
        setGroups(copiedGroups);

        const inGroupStudentIds = new Set<number>();
        copiedGroups.forEach(g => {
            g.student_ids.forEach(id => inGroupStudentIds.add(id));
        });

        setAvailableStudents(allStudents.filter(s => !inGroupStudentIds.has(s.id)));
    }, [initialGroups, allStudents]);

    const formatName = (u: User) => [u.last_name, u.first_name, u.patronymic].filter(Boolean).join(' ') || u.login;

    const filteredAvailable = availableStudents.filter(s =>
        formatName(s).toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.login.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, studentId: number, sourceGroupId: string | null) => {
        setDraggedStudent({ studentId, sourceGroupId });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', studentId.toString());
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement | HTMLButtonElement>, targetGroupId: string | null) => {
        e.preventDefault();
        if (!draggedStudent) return;
        const { studentId, sourceGroupId } = draggedStudent;

        if (sourceGroupId === targetGroupId) {
            setDraggedStudent(null);
            return;
        }

        const newGroups = groups.map(g => ({ ...g, student_ids: [...g.student_ids] }));
        let newAvailable = [...availableStudents];

        if (sourceGroupId === null) {
            newAvailable = newAvailable.filter(s => s.id !== studentId);
        } else {
            const srcGroup = newGroups.find(g => g.tempId === sourceGroupId);
            if (srcGroup) {
                srcGroup.student_ids = srcGroup.student_ids.filter(id => id !== studentId);
            }
        }

        if (targetGroupId === null) {
            const student = allStudents.find(s => s.id === studentId);
            if (student) newAvailable.push(student);
        } else {
            const tgtGroup = newGroups.find(g => g.tempId === targetGroupId);
            if (tgtGroup) {
                tgtGroup.student_ids.push(studentId);
            }
        }

        setGroups(newGroups);
        setAvailableStudents(newAvailable);
        setDraggedStudent(null);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement | HTMLButtonElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleMobileMove = (targetGroupId: string | null) => {
        if (!selectedStudentMobile) return;
        const { studentId, sourceGroupId } = selectedStudentMobile;

        if (sourceGroupId === targetGroupId) {
            setSelectedStudentMobile(null);
            return;
        }

        const newGroups = groups.map(g => ({ ...g, student_ids: [...g.student_ids] }));
        let newAvailable = [...availableStudents];

        if (sourceGroupId === null) {
            newAvailable = newAvailable.filter(s => s.id !== studentId);
        } else {
            const srcGroup = newGroups.find(g => g.tempId === sourceGroupId);
            if (srcGroup) {
                srcGroup.student_ids = srcGroup.student_ids.filter(id => id !== studentId);
            }
        }

        if (targetGroupId === null) {
            const student = allStudents.find(s => s.id === studentId);
            if (student) newAvailable.push(student);
        } else {
            const tgtGroup = newGroups.find(g => g.tempId === targetGroupId);
            if (tgtGroup) {
                tgtGroup.student_ids.push(studentId);
            }
        }

        setGroups(newGroups);
        setAvailableStudents(newAvailable);
        setSelectedStudentMobile(null);
    };

    const autoSplit = () => {
        if (groups.length === 0 || availableStudents.length === 0) return;

        const sortedAvailable = [...availableStudents].sort((a, b) => formatName(a).localeCompare(formatName(b)));
        const newGroups = groups.map(g => ({ ...g, student_ids: [...g.student_ids] }));

        let turn = 0;
        sortedAvailable.forEach(student => {
            newGroups[turn].student_ids.push(student.id);
            turn = (turn + 1) % newGroups.length;
        });

        setGroups(newGroups);
        setAvailableStudents([]);
    };

    const addGroup = () => {
        setGroups([...groups, {
            tempId: Math.random().toString(36).substr(2, 9),
            name: `Подгруппа ${groups.length + 1}`,
            room: '',
            teacher_id: null,
            student_ids: []
        }]);
    };

    const removeGroup = (tempId: string) => {
        const groupToRemove = groups.find(g => g.tempId === tempId);
        if (!groupToRemove) return;

        const studentsToReturn = allStudents.filter(s => groupToRemove.student_ids.includes(s.id));
        setAvailableStudents([...availableStudents, ...studentsToReturn]);
        setGroups(groups.filter(g => g.tempId !== tempId));
    };

    const updateGroupRoom = (tempId: string, room: string) => {
        setGroups(groups.map(g => g.tempId === tempId ? { ...g, room } : g));
    };

    const updateGroupName = (tempId: string, name: string) => {
        setGroups(groups.map(g => g.tempId === tempId ? { ...g, name } : g));
    };

    const updateGroupTeacher = (tempId: string, teacher_id: number | null) => {
        setGroups(groups.map(g => g.tempId === tempId ? { ...g, teacher_id } : g));
    };

    // --- Shared panel renderers ---
    const renderStudentCard = (s: User, sourceGroupId: string | null) => {
        const isSelectedOnMobile = isMobile && selectedStudentMobile?.studentId === s.id;
        const isDragged = draggedStudent?.studentId === s.id;

        return (
            <div
                key={s.id}
                draggable={!isMobile}
                onDragStart={!isMobile ? (e) => handleDragStart(e, s.id, sourceGroupId) : undefined}
                onDragEnd={!isMobile ? () => setDraggedStudent(null) : undefined}
                onClick={isMobile ? () => {
                    // Toggle selection on mobile tap
                    if (selectedStudentMobile?.studentId === s.id) {
                        setSelectedStudentMobile(null);
                    } else {
                        setSelectedStudentMobile({ studentId: s.id, sourceGroupId });
                    }
                } : undefined}
                style={{
                    padding: '8px 12px',
                    backgroundColor: isSelectedOnMobile ? 'var(--bg-tertiary, #e0f2fe)' : 'var(--bg-primary)',
                    border: isSelectedOnMobile ? '2px solid var(--primary-color, #0ea5e9)' : '1px solid var(--border-color)',
                    borderRadius: '6px',
                    cursor: isMobile ? 'pointer' : 'grab',
                    userSelect: 'none',
                    fontSize: '0.875rem',
                    flexShrink: 0,
                    opacity: isDragged ? 0.3 : 1,
                    transition: 'all 0.2s ease',
                    transform: isSelectedOnMobile ? 'scale(0.98)' : 'none'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{formatName(s)}</span>
                    {isSelectedOnMobile && (
                        <span style={{ fontSize: '10px', color: 'var(--primary-color, #0ea5e9)', fontWeight: 'bold' }}>Выбран</span>
                    )}
                </div>
            </div>
        );
    };

    const renderAvailablePanel = (extraStyle?: React.CSSProperties) => (
        <div
            style={{
                flex: isMobile ? 1 : '0 0 300px',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'var(--bg-secondary)',
                ...(extraStyle || {})
            } as React.CSSProperties}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, null)}
        >
            <h4 style={{ margin: '0 0 12px 0' }}>Ученики класса ({availableStudents.length})</h4>
            <input
                type="text"
                placeholder="Поиск по ФИО..."
                className={styles.input}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ marginBottom: '12px', fontSize: '0.875rem', padding: '6px 10px' }}
            />
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
                {filteredAvailable.map(s => renderStudentCard(s, null))}
                {filteredAvailable.length === 0 && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
                        {availableStudents.length === 0 ? 'Все распределены' : 'Не найдено'}
                    </p>
                )}
            </div>
        </div>
    );

    const renderGroupPanel = (g: GroupData, extraStyle?: React.CSSProperties) => {
        const groupStudents = allStudents.filter(s => g.student_ids.includes(s.id));
        return (
            <div
                key={g.tempId}
                style={{
                    flex: 1,
                    minWidth: isMobile ? undefined : '250px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: 'var(--bg-secondary)',
                    ...(extraStyle || {})
                } as React.CSSProperties}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, g.tempId)}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <input
                        type="text"
                        value={g.name}
                        onChange={(e) => updateGroupName(g.tempId, e.target.value)}
                        className={styles.input}
                        style={{ fontWeight: 'bold', border: 'none', background: 'transparent', padding: 0, flex: 1 }}
                    />
                    <button
                        onClick={() => removeGroup(g.tempId)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px' }}
                    >
                        ×
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
                    <input
                        type="text"
                        placeholder="Каб."
                        className={styles.input}
                        value={g.room || ''}
                        onChange={(e) => updateGroupRoom(g.tempId, e.target.value)}
                        style={{ width: isMobile ? '100%' : '80px', fontSize: '0.875rem' }}
                    />
                    <select
                        className={styles.input}
                        value={g.teacher_id || ''}
                        onChange={(e) => updateGroupTeacher(g.tempId, e.target.value ? Number(e.target.value) : null)}
                        style={{ flex: 1, fontSize: '0.875rem' }}
                    >
                        <option value="">Без учителя</option>
                        {teachers.map(t => (
                            <option key={t.id} value={t.id}>
                                {t.last_name || t.login} {t.first_name?.trim() ? t.first_name.trim()[0].toUpperCase() + '.' : ''}{t.patronymic?.trim() ? t.patronymic.trim()[0].toUpperCase() + '.' : ''}
                            </option>
                        ))}
                    </select>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
                    {groupStudents.map(s => renderStudentCard(s, g.tempId))}
                    {groupStudents.length === 0 && (
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
                            Перетащите сюда
                        </p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1, gap: isMobile ? '10px' : '16px' }}>
            {isMobile && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
                    <button className={styles.btnSecondary} onClick={autoSplit} style={{ flex: 1, fontSize: '0.8rem' }}>
                        Автосортировка
                    </button>
                    <button className={styles.btnSecondary} onClick={addGroup} style={{ flex: 1, fontSize: '0.8rem' }}>
                        Новая подгруппа
                    </button>
                </div>
            )}

            {!isMobile && (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem', margin: 0, flexShrink: 0 }}>
                    Перетащите ученика в нужную группу
                </p>
            )}

            {isMobile ? (
                /* ===== MOBILE: Tabbed layout ===== */
                <>
                    {/* Tab bar */}
                    <div style={{
                        display: 'flex',
                        gap: '6px',
                        overflowX: 'auto',
                        paddingBottom: '4px',
                        flexShrink: 0,
                        WebkitOverflowScrolling: 'touch'
                    }}>
                        <button
                            onClick={() => {
                                if (selectedStudentMobile) {
                                    // Move student to 'available'
                                    handleMobileMove(null);
                                } else {
                                    setActiveTab('available');
                                }
                            }}
                            onDragOver={!isMobile ? (e) => {
                                handleDragOver(e);
                                setDragOverTab('available');
                            } : undefined}
                            onDragLeave={!isMobile ? () => setDragOverTab(null) : undefined}
                            onDrop={!isMobile ? (e) => {
                                setDragOverTab(null);
                                handleDrop(e, null);
                            } : undefined}
                            style={{
                                flex: 'none',
                                padding: '8px 14px',
                                borderRadius: '20px',
                                border: (activeTab === 'available' || dragOverTab === 'available') ? '2px solid var(--primary-color, #0ea5e9)' : '1px solid var(--border-color)',
                                background: (activeTab === 'available' || dragOverTab === 'available') ? 'rgba(14, 165, 233, 0.15)' : 'var(--bg-secondary)',
                                color: (activeTab === 'available' || dragOverTab === 'available') ? 'var(--primary-color, #0ea5e9)' : 'var(--text-secondary)',
                                fontSize: '0.8rem',
                                fontWeight: (activeTab === 'available' || dragOverTab === 'available') ? 600 : 400,
                                transform: dragOverTab === 'available' ? 'scale(1.05)' : 'none',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            Ученики ({availableStudents.length})
                        </button>
                        {groups.map(g => {
                            const isActive = activeTab === g.tempId;
                            const isDragOver = dragOverTab === g.tempId;
                            return (
                                <button
                                    key={g.tempId}
                                    onClick={() => {
                                        if (selectedStudentMobile) {
                                            handleMobileMove(g.tempId);
                                        } else {
                                            setActiveTab(g.tempId);
                                        }
                                    }}
                                    onDragOver={!isMobile ? (e) => {
                                        handleDragOver(e);
                                        setDragOverTab(g.tempId);
                                    } : undefined}
                                    onDragLeave={!isMobile ? () => setDragOverTab(null) : undefined}
                                    onDrop={!isMobile ? (e) => {
                                        setDragOverTab(null);
                                        handleDrop(e, g.tempId);
                                    } : undefined}
                                    style={{
                                        flex: 'none',
                                        padding: '8px 14px',
                                        borderRadius: '20px',
                                        border: (isActive || isDragOver) ? '2px solid var(--primary-color, #0ea5e9)' : '1px solid var(--border-color)',
                                        background: (isActive || isDragOver) ? 'rgba(14, 165, 233, 0.15)' : 'var(--bg-secondary)',
                                        color: (isActive || isDragOver) ? 'var(--primary-color, #0ea5e9)' : 'var(--text-secondary)',
                                        fontSize: '0.8rem',
                                        fontWeight: (isActive || isDragOver) ? 600 : 400,
                                        transform: isDragOver ? 'scale(1.05)' : 'none',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {g.name} ({g.student_ids.length})
                                </button>
                            );
                        })}
                    </div>

                    {/* Active tab content */}
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        {activeTab === 'available' && renderAvailablePanel({ flex: 1, minHeight: 0 })}
                        {groups.map(g =>
                            activeTab === g.tempId ? renderGroupPanel(g, { flex: 1, minHeight: 0 }) : null
                        )}
                    </div>

                </>
            ) : (
                /* ===== DESKTOP: Original side-by-side layout ===== */
                <div style={{ display: 'flex', gap: '24px', flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }}>
                    {renderAvailablePanel({ flex: 1, minHeight: 0 })}
                    <div style={{ display: 'flex', gap: '16px', flex: 2, minHeight: 0 }}>
                        {groups.map(g => renderGroupPanel(g, { flex: 1, minHeight: 0 }))}
                    </div>
                </div>
            )}

            {/* Footer buttons */}
            <div style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                justifyContent: isMobile ? 'flex-start' : 'space-between',
                alignItems: isMobile ? 'stretch' : 'center',
                gap: '8px',
                marginTop: 'auto',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-color)',
                flexShrink: 0
            }}>
                {isMobile ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem', margin: '0 0 8px 0' }}>
                        Нажмите на ученика, затем на нужную вкладку сверху
                    </p>
                ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className={styles.btnSecondary} onClick={autoSplit} title="Равномерно распределить оставшихся учеников">
                            Автосортировка 50/50
                        </button>
                        <button className={styles.btnSecondary} onClick={addGroup}>
                            Новая подгруппа
                        </button>
                    </div>
                )}

                <div className={styles.registerActions} style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button className={styles.btnSecondary} onClick={onCancel}>
                        Отмена
                    </button>
                    <button className={styles.btnPrimary} onClick={() => onSave(groups)}>
                        Сохранить изменения
                    </button>
                </div>
            </div>
        </div>
    );
}
