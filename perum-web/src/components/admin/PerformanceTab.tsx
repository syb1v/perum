'use client';

import { useState, useEffect } from 'react';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement,
    LineElement, Title, Tooltip, Filler, Legend, ArcElement, BarElement,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import api from '@/lib/apiClient';
import { PerformanceResponse } from '@/types';
import styles from './AdminDashboardTab.module.css';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend, ArcElement, BarElement
);

export default function PerformanceTab() {
    const [stats, setStats] = useState<PerformanceResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState(30);

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            try {
                const data = await api.get<PerformanceResponse>(`/admin/dashboard/performance?period_days=${period}`);
                setStats(data);
            } catch (err) {
                console.error('Ошибка загрузки успеваемости:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, [period]);

    if (loading && !stats) {
        return (
            <div className={styles.spinnerContainer}>
                <div className={styles.spinner}></div>
            </div>
        );
    }

    if (!stats) {
        return <div style={{ color: 'red', marginTop: 20 }}>Ошибка при получении данных успеваемости.</div>;
    }

    // Линейный график "Средний балл по дням"
    const lineData = {
        labels: stats.daily_stats.map(d => d.date),
        datasets: [
            {
                label: 'Средний балл школы',
                data: stats.daily_stats.map(d => d.avg_grade),
                borderColor: '#3498db',
                backgroundColor: 'rgba(52, 152, 219, 0.1)',
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: '#3498db',
                fill: true,
                tension: 0.4
            }
        ],
    };

    const lineOptions = {
        responsive: true,
        plugins: {
            legend: { position: 'top' as const, labels: { color: '#8f9bb3', usePointStyle: true, boxWidth: 8 } },
            tooltip: { mode: 'index' as const, intersect: false, backgroundColor: 'rgba(34, 38, 49, 0.9)', titleColor: '#fff', bodyColor: '#fff', borderColor: '#2e3440', borderWidth: 1 }
        },
        scales: {
            y: { min: 2, max: 5, grid: { color: 'rgba(255, 255, 255, 0.03)', drawBorder: false }, ticks: { color: '#8f9bb3' } },
            x: { grid: { display: false }, ticks: { color: '#8f9bb3', maxRotation: 0, autoSkipPadding: 20 } }
        },
        maintainAspectRatio: false,
        interaction: { mode: 'nearest' as const, axis: 'x' as const, intersect: false }
    };

    // Подготовка данных для Bar chart - распределение оценок
    const getGradeCount = (val: number) => {
        const found = stats.grade_distribution.find(g => g.grade_value === val);
        return found ? found.count : 0;
    };

    const barData = {
        labels: ['Отлично (5)', 'Хорошо (4)', 'Удовл. (3)', 'Неудовл. (2)'],
        datasets: [
            {
                label: 'Количество оценок',
                data: [getGradeCount(5), getGradeCount(4), getGradeCount(3), getGradeCount(2)],
                backgroundColor: ['#2ecc71', '#3498db', '#f1c40f', '#e74c3c'],
                borderWidth: 0,
                borderRadius: 4,
            }
        ]
    };

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.dashboardHeader}>
                <div className={styles.headerTitle}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                    </svg>
                    Успеваемость Школы
                </div>
                <div className={styles.headerControls}>
                    <select className={styles.periodSelect} value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
                        <option value={7}>7 дней</option>
                        <option value={30}>30 дней</option>
                        <option value={90}>Квартал</option>
                        <option value={365}>Год</option>
                    </select>
                    <button className={styles.refreshBtn} onClick={() => setPeriod(period)}>Обновить</button>
                </div>
            </div>

            <div className={styles.metricsGridTwo}>
                <div className={styles.metricCard}>
                    <span className={styles.metricValue} style={{ color: 'var(--accent-primary)' }}>{stats.average_school_grade.toFixed(2)}</span>
                    <span className={styles.metricLabel}>Средний балл по школе</span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricValue} style={{ color: 'var(--success)' }}>{stats.total_grades_given}</span>
                    <span className={styles.metricLabel}>Всего выставлено оценок</span>
                </div>
            </div>

            <div className={styles.chartContainerWrapper} style={{ marginTop: '24px' }}>
                <div className={styles.chartTitle}>Динамика успеваемости (средний балл по дням)</div>
                <div className={styles.chartBody}>
                    <Line data={lineData} options={lineOptions} />
                </div>
            </div>

            <div className={styles.tablesGridOneTwo} style={{ marginTop: '24px' }}>
                <div className={styles.tableCard}>
                    <div className={styles.tableHeader}>Распределение оценок</div>
                    <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                        <Bar
                            data={barData}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false } },
                                scales: {
                                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8f9bb3' } },
                                    x: { grid: { display: false }, ticks: { color: '#8f9bb3' } }
                                }
                            }}
                        />
                    </div>
                </div>

                <div className={styles.innerGridTransparent}>
                    <div className={styles.tableCard} style={{ margin: 0 }}>
                        <div className={styles.tableHeader}>🔥 Топ Предметов</div>
                        <table className={styles.analyticsTable}>
                            <thead>
                                <tr>
                                    <th>Предмет</th>
                                    <th className={styles.rightAlign}>Ср. Балл</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.top_subjects.map((subj, idx) => (
                                    <tr key={idx}>
                                        <td>{subj.subject_name}</td>
                                        <td className={styles.rightAlign} style={{ color: 'var(--success)' }}>{subj.avg_grade.toFixed(2)}</td>
                                    </tr>
                                ))}
                                {stats.top_subjects.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Нет данных</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <div className={styles.tableCard} style={{ margin: 0 }}>
                        <div className={styles.tableHeader}>📉 Отстающие Предметы</div>
                        <table className={styles.analyticsTable}>
                            <thead>
                                <tr>
                                    <th>Предмет</th>
                                    <th className={styles.rightAlign}>Ср. Балл</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.bottom_subjects.map((subj, idx) => (
                                    <tr key={idx}>
                                        <td>{subj.subject_name}</td>
                                        <td className={styles.rightAlign} style={{ color: 'var(--error)' }}>{subj.avg_grade.toFixed(2)}</td>
                                    </tr>
                                ))}
                                {stats.bottom_subjects.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Нет данных</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
