'use client';

import { KPIStats } from '@/types';
import styles from '../../app/teacher/analytics/page.module.css';

interface KPICardsProps {
    stats: KPIStats;
}

export default function KPICards({ stats }: KPICardsProps) {
    const avg = stats.avg_grade || 0;
    const avgClass =
        avg >= 4.0 ? styles.indicatorGood :
            avg >= 3.0 ? styles.indicatorMedium :
                avg > 0 ? styles.indicatorBad : '';

    return (
        <div className={styles.kpiCards}>
            <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Средний балл</div>
                <div className={`${styles.kpiValue} ${avgClass}`}>{avg.toFixed(2)}</div>
            </div>

            <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Всего оценок</div>
                <div className={styles.kpiValue}>{stats.total_grades}</div>
                <div className={styles.kpiRatio}>за выбранный период</div>
            </div>

            <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Неудовлетворительно</div>
                <div className={`${styles.kpiValue} ${styles.indicatorBad}`}>{stats.bad_grades}</div>
                <div className={styles.kpiRatio}>{stats.bad_ratio} от общего числа</div>
            </div>

            <div className={styles.kpiCard}>
                <div className={styles.kpiLabel}>Проблемные темы</div>
                <div className={styles.kpiValue}>{stats.problem_topics_count}</div>
                <div className={styles.kpiRatio}>требуют внимания</div>
            </div>
        </div>
    );
}
