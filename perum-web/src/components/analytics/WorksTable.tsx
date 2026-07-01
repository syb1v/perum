'use client';

import { WorkAnalysis } from '@/types';
import styles from '../../app/teacher/analytics/page.module.css';

interface WorksTableProps {
    works: WorkAnalysis[];
    onWorkSelect: (work: WorkAnalysis) => void;
}

export default function WorksTable({ works, onWorkSelect }: WorksTableProps) {
    if (!works || works.length === 0) {
        return <div className={styles.emptyState}>Нет данных</div>;
    }

    const getGradeClass = (grade: number) => {
        if (grade >= 4.0) return styles.indicatorGood;
        if (grade >= 3.0) return styles.indicatorMedium;
        return styles.indicatorBad;
    };

    return (
        <div className={styles.tableContainer}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>Дата</th>
                        <th>Тип</th>
                        <th>Тема</th>
                        <th>Ср. балл</th>
                        <th>Низкие</th>
                    </tr>
                </thead>
                <tbody>
                    {works.map((work, index) => (
                        <tr key={work.id || index} onClick={() => onWorkSelect(work)}>
                            <td>{new Date(work.date).toLocaleDateString('ru-RU')}</td>
                            <td>{work.type}</td>
                            <td>{work.topic || '—'}</td>
                            <td className={getGradeClass(work.avg)}>{work.avg.toFixed(2)}</td>
                            <td>{work.bad_ratio}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
