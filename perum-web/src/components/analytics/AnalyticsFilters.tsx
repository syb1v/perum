'use client';

import journalStyles from '../../app/teacher/journal/page.module.css';

interface PickerOption {
    id: number;
    name: string;
}

interface AnalyticsFiltersProps {
    classes: PickerOption[];
    subjects: PickerOption[];
    selectedClassId: number;
    selectedSubjectId: number;
    selectedPeriod: string;
    periods: { id: number; name: string }[];
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
    periods,
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
                    {periods.map((period) => (
                        <option key={period.id} value={String(period.id)}>{period.name}</option>
                    ))}
                </select>
            </div>
        </div>
    );
}
