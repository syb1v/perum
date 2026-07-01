'use client';

import { useState, useEffect } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Filler,
    Legend,
    ArcElement,
    BarElement,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import api from '@/lib/apiClient';
import styles from './AdminDashboardTab.module.css';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Filler,
    Legend,
    ArcElement,
    BarElement
);

interface ClassPerformance {
    class_id: number;
    class_name: string;
    grade_level: number | null;
    avg_grade: number;
    grades_count: number;
}

interface FailingStudent {
    id: number;
    name: string;
    avg: number;
    grades_count: number;
    class_name: string | null;
}

interface TeacherActivity {
    id: number;
    name: string;
    grades_given: number;
}

interface OverviewResponse {
    success: boolean;
    kpi: {
        average_grade: number;
        total_grades: number;
        total_students: number;
        failing_count: number;
        absences: number;
        homework_count: number;
        control_work_count: number;
    };
    class_performance: ClassPerformance[];
    grade_distribution: { grade_value: number; count: number }[];
    attendance: { mark: string; count: number }[];
    failing_students: FailingStudent[];
    teacher_activity: TeacherActivity[];
    daily_avg: { date: string; avg_grade: number }[];
}

export default function AdminDashboardTab() {
    const [data, setData] = useState<OverviewResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState(30);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            try {
                const res = await api.get<OverviewResponse>(`/admin/dashboard/overview?period_days=${period}`);
                setData(res);
            } catch (err) {
                console.error('Ошибка загрузки обзора:', err);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [period]);

    if (loading && !data) {
        return (
            <div className={styles.spinnerContainer}>
                <div className={styles.spinner}></div>
            </div>
        );
    }
    if (!data) {
        return <div style={{ color: 'red', marginTop: 20 }}>Не удалось загрузить обзор школы.</div>;
    }

    const k = data.kpi;
    const topClasses = [...data.class_performance].slice(0, 5);
    const bottomClasses = [...data.class_performance].slice(-5).reverse();

    // Линейный график среднего балла по дням
    const lineData = {
        labels: data.daily_avg.map(d => d.date),
        datasets: [{
            label: 'Средний балл',
            data: data.daily_avg.map(d => d.avg_grade),
            borderColor: '#0ea5e9',
            backgroundColor: 'rgba(14, 165, 233, 0.1)',
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#0ea5e9',
            fill: true,
            tension: 0.4,
        }],
    };

    const lineOptions = {
        responsive: true,
        plugins: {
            legend: { position: 'top' as const, labels: { color: '#8f9bb3', usePointStyle: true, boxWidth: 8 } },
            tooltip: { mode: 'index' as const, intersect: false },
        },
        scales: {
            y: { min: 2, max: 5, grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#8f9bb3' } },
            x: { grid: { display: false }, ticks: { color: '#8f9bb3', maxRotation: 0, autoSkipPadding: 20 } },
        },
        maintainAspectRatio: false,
    };

    const getGradeCount = (val: number) => data.grade_distribution.find(g => g.grade_value === val)?.count ?? 0;
    const barData = {
        labels: ['Отлично (5)', 'Хорошо (4)', 'Удовл. (3)', 'Неудовл. (2)'],
        datasets: [{
            label: 'Количество оценок',
            data: [getGradeCount(5), getGradeCount(4), getGradeCount(3), getGradeCount(2)],
            backgroundColor: ['#2ecc71', '#3498db', '#f1c40f', '#e74c3c'],
            borderWidth: 0,
            borderRadius: 4,
        }],
    };

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.dashboardHeader}>
                <div className={styles.headerTitle}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                    Обзор школы
                </div>
                <div className={styles.headerControls}>
                    <select className={styles.periodSelect} value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
                        <option value={7}>7 дней</option>
                        <option value={30}>30 дней</option>
                        <option value={90}>Квартал</option>
                        <option value={365}>Год</option>
                    </select>
                </div>
            </div>

            {/* KPI карточки */}
            <div className={styles.metricsGrid}>
                <div className={styles.metricCard}>
                    <span className={styles.metricValue}>{k.average_grade.toFixed(2)}</span>
                    <span className={styles.metricLabel}>Средний балл школы</span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricValue}>{k.total_grades}</span>
                    <span className={styles.metricLabel}>Оценок выставлено</span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricValue}>{k.total_students}</span>
                    <span className={styles.metricLabel}>Активных учеников</span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricValue} style={{ color: k.failing_count > 0 ? '#e74c3c' : 'inherit' }}>
                        {k.failing_count}
                    </span>
                    <span className={styles.metricLabel}>Отстающих</span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricValue}>{k.absences}</span>
                    <span className={styles.metricLabel}>Пропусков (УП+НП)</span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricValue}>{k.homework_count}</span>
                    <span className={styles.metricLabel}>ДЗ выдано</span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricValue}>{k.control_work_count}</span>
                    <span className={styles.metricLabel}>Контрольных запланировано</span>
                </div>
            </div>

            {/* График среднего балла */}
            <div className={styles.chartContainerWrapper} style={{ marginTop: '24px' }}>
                <div className={styles.chartTitle}>Средний балл по дням</div>
                <div className={styles.chartBody}>
                    <Line data={lineData} options={lineOptions} />
                </div>
            </div>

            {/* Распределение и классы */}
            <div className={styles.tablesGrid}>
                <div className={styles.tableCard}>
                    <div className={styles.tableHeader}>Распределение оценок</div>
                    <div style={{ height: '220px' }}>
                        <Bar
                            data={barData}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false } },
                                scales: {
                                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8f9bb3' } },
                                    x: { grid: { display: false }, ticks: { color: '#8f9bb3' } },
                                },
                            }}
                        />
                    </div>
                </div>

                <div className={styles.tableCard}>
                    <div className={styles.tableHeader}>🔥 Лучшие классы</div>
                    <table className={styles.analyticsTable}>
                        <thead>
                            <tr>
                                <th>Класс</th>
                                <th className={styles.rightAlign}>Ср. балл</th>
                                <th className={styles.rightAlign}>Оценок</th>
                            </tr>
                        </thead>
                        <tbody>
                            {topClasses.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Нет данных</td></tr>}
                            {topClasses.map(c => (
                                <tr key={c.class_id}>
                                    <td>{c.class_name}</td>
                                    <td className={styles.rightAlign} style={{ color: 'var(--success)' }}>{c.avg_grade.toFixed(2)}</td>
                                    <td className={styles.rightAlign}>{c.grades_count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className={styles.tableCard}>
                    <div className={styles.tableHeader}>📉 Отстающие классы</div>
                    <table className={styles.analyticsTable}>
                        <thead>
                            <tr>
                                <th>Класс</th>
                                <th className={styles.rightAlign}>Ср. балл</th>
                                <th className={styles.rightAlign}>Оценок</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bottomClasses.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Нет данных</td></tr>}
                            {bottomClasses.map(c => (
                                <tr key={c.class_id}>
                                    <td>{c.class_name}</td>
                                    <td className={styles.rightAlign} style={{ color: c.avg_grade < 3.5 ? 'var(--error)' : 'inherit' }}>{c.avg_grade.toFixed(2)}</td>
                                    <td className={styles.rightAlign}>{c.grades_count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Посещаемость + Активность учителей + Отстающие */}
            <div className={styles.tablesGrid} style={{ marginTop: 24 }}>
                <div className={styles.tableCard}>
                    <div className={styles.tableHeader}>Посещаемость</div>
                    <table className={styles.analyticsTable}>
                        <thead>
                            <tr>
                                <th>Пометка</th>
                                <th className={styles.rightAlign}>Кол-во</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.attendance.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Нет пометок</td></tr>}
                            {data.attendance.map((a) => (
                                <tr key={a.mark}>
                                    <td>{a.mark}</td>
                                    <td className={styles.rightAlign}>{a.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className={styles.tableCard}>
                    <div className={styles.tableHeader}>👨‍🏫 Активные учителя</div>
                    <table className={styles.analyticsTable}>
                        <thead>
                            <tr>
                                <th>Учитель</th>
                                <th className={styles.rightAlign}>Оценок</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.teacher_activity.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Нет данных</td></tr>}
                            {data.teacher_activity.map(t => (
                                <tr key={t.id}>
                                    <td>{t.name}</td>
                                    <td className={styles.rightAlign}>{t.grades_given}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className={styles.tableCard}>
                    <div className={styles.tableHeader}>⚠️ Отстающие ученики</div>
                    <table className={styles.analyticsTable}>
                        <thead>
                            <tr>
                                <th>Ученик</th>
                                <th>Класс</th>
                                <th className={styles.rightAlign}>Ср.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.failing_students.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Все ученики справляются</td></tr>}
                            {data.failing_students.map(s => (
                                <tr key={s.id}>
                                    <td>{s.name}</td>
                                    <td style={{ color: 'var(--text-muted)' }}>{s.class_name ?? '—'}</td>
                                    <td className={styles.rightAlign} style={{ color: 'var(--error)' }}>{s.avg.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
