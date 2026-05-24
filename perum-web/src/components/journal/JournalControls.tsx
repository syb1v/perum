'use client';

import { ClassInfo, Subject } from '@/types';
import styles from '../../app/teacher/journal/page.module.css';

interface PeriodOption {
    id: number;
    name: string;
    period_type: string;
    start_date: string;
    end_date: string;
}

interface JournalControlsProps {
    classes: ClassInfo[];
    subjects: Subject[];
    selectedClassId: number;
    selectedSubjectId: number;
    periods: PeriodOption[];
    selectedPeriodId: number;
    onClassChange: (id: number) => void;
    onSubjectChange: (id: number) => void;
    onPeriodChange: (id: number) => void;
    children?: React.ReactNode;
}

export default function JournalControls({
    classes,
    subjects,
    selectedClassId,
    selectedSubjectId,
    periods,
    selectedPeriodId,
    onClassChange,
    onSubjectChange,
    onPeriodChange,
    children
}: JournalControlsProps) {
    const currentPeriod = periods.find(p => p.id === selectedPeriodId);

    return (
        <div className={styles.journalControls}>
            <div className={styles.controlGroup}>
                <label>Класс</label>
                <select
                    value={selectedClassId || ''}
                    onChange={(e) => onClassChange(Number(e.target.value))}
                >
                    <option value="">Выберите класс</option>
                    {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                </select>
            </div>

            <div className={styles.controlGroup}>
                <label>Предмет</label>
                <select
                    value={selectedSubjectId || ''}
                    onChange={(e) => onSubjectChange(Number(e.target.value))}
                    disabled={!selectedClassId}
                >
                    <option value="">Выберите предмет</option>
                    {subjects.map((subj) => (
                        <option key={subj.id} value={subj.id}>{subj.name}</option>
                    ))}
                </select>
            </div>

            {periods.length > 0 && (
                <div className={styles.controlGroup}>
                    <label>Период</label>
                    <select
                        value={selectedPeriodId || ''}
                        onChange={(e) => onPeriodChange(Number(e.target.value))}
                        disabled={!selectedClassId || !selectedSubjectId}
                    >
                        {periods.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
            )}

            {currentPeriod && (
                <div className={styles.controlGroup}>
                    <label>Даты</label>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '8px 0' }}>
                        {new Date(currentPeriod.start_date).toLocaleDateString('ru-RU')} — {new Date(currentPeriod.end_date).toLocaleDateString('ru-RU')}
                    </span>
                </div>
            )}

            {children && (
                <div className={styles.controlGroup} style={{ marginLeft: 'auto', alignSelf: 'flex-end', paddingBottom: '2px' }}>
                    {children}
                </div>
            )}
        </div>
    );
}

