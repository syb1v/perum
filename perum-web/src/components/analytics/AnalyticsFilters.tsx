'use client';

import { ClassInfo, Subject } from '@/types';
import journalStyles from '../../app/teacher/journal/page.module.css';

interface AnalyticsFiltersProps {
    classes: ClassInfo[];
    subjects: Subject[];
    selectedClassId: number;
    selectedSubjectId: number;
    selectedPeriod: string;
    onClassChange: (id: number) => void;
    onSubjectChange: (id: number) => void;
    onPeriodChange: (period: string) => void;
}

export default function AnalyticsFilters({
    classes,
    subjects,
    selectedClassId,
    selectedSubjectId,
    selectedPeriod,
    onClassChange,
    onSubjectChange,
    onPeriodChange
}: AnalyticsFiltersProps) {
    return (
        <div className={journalStyles.journalControls}>
            <div className={journalStyles.controlGroup}>
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

            <div className={journalStyles.controlGroup}>
                <label>Предмет</label>
                <select
                    value={selectedSubjectId || ''}
                    onChange={(e) => onSubjectChange(Number(e.target.value))}
                    disabled={!selectedClassId}
                >
                    <option value="">Все предметы</option>
                    {subjects.map((subj) => (
                        <option key={subj.id} value={subj.id}>{subj.name}</option>
                    ))}
                </select>
            </div>

            <div className={journalStyles.controlGroup}>
                <label>Период</label>
                <select
                    value={selectedPeriod}
                    onChange={(e) => onPeriodChange(e.target.value)}
                >
                    <option value="current">Текущая четверть</option>
                    <option value="quarter-1">1 четверть</option>
                    <option value="quarter-2">2 четверть</option>
                    <option value="quarter-3">3 четверть</option>
                    <option value="quarter-4">4 четверть</option>
                    <option value="half-year-1">1 полугодие</option>
                    <option value="half-year-2">2 полугодие</option>
                    <option value="year">Весь год</option>
                </select>
            </div>
        </div>
    );
}
