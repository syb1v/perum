'use client';

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { WorkAnalysis } from '@/types';
import styles from '../../app/teacher/analytics/page.module.css';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

interface WorkAnalysisPanelProps {
    work: WorkAnalysis | null;
}

export default function WorkAnalysisPanel({ work }: WorkAnalysisPanelProps) {
    if (!work) {
        return (
            <div className={styles.panel}>
                <div className={styles.panelTitle}>Анализ работы</div>
                <div className={styles.emptyState}>Выберите работу из таблицы</div>
            </div>
        );
    }

    // Dummy data for distribution as per analytics.js
    const data = {
        labels: ['5', '4', '3', '2'],
        datasets: [
            {
                label: 'Количество оценок',
                data: [0, 0, 0, 0], // Placeholder
                backgroundColor: [
                    '#10b981',
                    '#3b82f6',
                    '#f59e0b',
                    '#ef4444'
                ]
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        },
        scales: {
            y: { beginAtZero: true, ticks: { color: '#9898a6' } },
            x: { grid: { display: false }, ticks: { color: '#9898a6' } }
        }
    };

    const getGradeClass = (grade: number) => {
        if (grade >= 4.0) return styles.indicatorGood;
        if (grade >= 3.0) return styles.indicatorMedium;
        return styles.indicatorBad;
    };

    return (
        <div className={styles.panel}>
            <div className={styles.panelTitle}>Анализ работы</div>

            <div className={styles.chartContainer} style={{ height: '250px', marginBottom: '24px' }}>
                <Bar data={data} options={options} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', padding: '8px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Средний балл</span>
                    <span className={`${styles.statValue} ${getGradeClass(work.avg)}`}>{work.avg.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', padding: '8px 0' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Низкие оценки</span>
                    <span className={styles.statValue}>{work.bad_ratio}</span>
                </div>
            </div>
        </div>
    );
}
