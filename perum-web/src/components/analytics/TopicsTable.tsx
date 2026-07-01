'use client';

import { TopicStats } from '@/types';
import styles from '../../app/teacher/analytics/page.module.css';

interface TopicsTableProps {
    topics: TopicStats[];
}

export default function TopicsTable({ topics }: TopicsTableProps) {
    if (!topics || topics.length === 0) {
        return <div className={styles.emptyState}>Нет данных</div>;
    }

    const getGradeClass = (grade: number) => {
        if (grade >= 4.0) return styles.indicatorGood;
        if (grade >= 3.0) return styles.indicatorMedium;
        return styles.indicatorBad;
    };

    return (
        <div className={styles.topicsTableSection}> {/* Reusing class or using styles.tableContainer */}
            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Тема</th>
                            <th>Средний балл</th>
                            <th>Низкие оценки</th>
                        </tr>
                    </thead>
                    <tbody>
                        {topics.map((topic, index) => (
                            <tr key={index}>
                                <td>{topic.name}</td>
                                <td className={getGradeClass(topic.avg)}>{topic.avg.toFixed(2)}</td>
                                <td>{topic.bad_ratio}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
