'use client';

import React, { useState, useEffect } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Filler,
    Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import styles from './page.module.css';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement, BarElement,
    Title, Tooltip, Filler, Legend
);

interface SchoolCompare {
    id: number;
    name: string;
    timezone: string;
    is_active: boolean;
    users: number;
    students: number;
    teachers: number;
    classes: number;
    avg_grade: number;
    grades_count: number;
    active_users: number;
    lvk_distributed: number;
    lvk_spent: number;
}

interface PlatformOverview {
    kpi: {
        schools_total: number;
        schools_active: number;
        schools_inactive: number;
        users_total: number;
        students_total: number;
        teachers_total: number;
        admins_total: number;
        new_users_period: number;
        new_grades_period: number;
        active_users_period: number;
    };
    schools_compare: SchoolCompare[];
    daily_active: { date: string; users: number; grades: number }[];
    role_distribution: { role: string; count: number }[];
}

const ROLE_LABELS: Record<string, string> = {
    student: 'Ученики',
    teacher: 'Учителя',
    class_teacher: 'Учителя-предметники',
    homeroom_teacher: 'Классные рук-ли',
    admin: 'Админы школы',
    school_admin: 'Завучи',
    system_admin: 'Системные админы',
    parent: 'Родители',
};

export default function SystemAdminDashboard() {
    const [data, setData] = useState<PlatformOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState(30);

    useEffect(() => {
        const headers = {
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        };
        setLoading(true);
        fetch(`/api/system/dashboard/overview?period_days=${period}`, { headers })
            .then(res => res.json())
            .then(d => {
                setData(d);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [period]);

    if (loading || !data) {
        return (
            <div className={styles.loadingScreen}>
                <div className={styles.spinner} />
                <span>Загрузка обзора платформы...</span>
            </div>
        );
    }

    const k = data.kpi;
    const lineData = {
        labels: data.daily_active.map(d => d.date),
        datasets: [
            {
                label: 'Новые пользователи',
                data: data.daily_active.map(d => d.users),
                borderColor: '#a78bfa',
                backgroundColor: 'rgba(167, 139, 250, 0.15)',
                borderWidth: 2,
                pointRadius: 2,
                fill: true,
                tension: 0.4,
                yAxisID: 'y',
            },
            {
                label: 'Оценки выставлено',
                data: data.daily_active.map(d => d.grades),
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
                borderWidth: 2,
                pointRadius: 2,
                fill: false,
                tension: 0.4,
                yAxisID: 'y1',
            },
        ],
    };
    const lineOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' as const, labels: { color: '#cbd5e1' } } },
        scales: {
            y: { type: 'linear' as const, position: 'left' as const, beginAtZero: true, ticks: { color: '#94a3b8' } },
            y1: { type: 'linear' as const, position: 'right' as const, beginAtZero: true, grid: { display: false }, ticks: { color: '#94a3b8' } },
            x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkipPadding: 16 } },
        },
    };

    const sortedSchools = [...data.schools_compare].sort((a, b) => b.avg_grade - a.avg_grade);

    return (
        <div>
            {/* Период */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <select
                    value={period}
                    onChange={e => setPeriod(Number(e.target.value))}
                    style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        padding: '6px 12px',
                        borderRadius: 8,
                    }}
                >
                    <option value={7}>За 7 дней</option>
                    <option value={30}>За 30 дней</option>
                    <option value={90}>За квартал</option>
                    <option value={365}>За год</option>
                </select>
            </div>

            {/* KPI - первая строка: школы и пользователи */}
            <div className={styles.metricsGrid}>
                <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Всего школ</span>
                    <span className={styles.metricValue}>{k.schools_total}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {k.schools_active} активных · {k.schools_inactive} приостановлены
                    </span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Всего пользователей</span>
                    <span className={styles.metricValue}>{k.users_total}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--success, #2ecc71)' }}>+{k.new_users_period} за период</span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Активных за период</span>
                    <span className={styles.metricValue}>{k.active_users_period}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {k.users_total > 0 ? Math.round((k.active_users_period / k.users_total) * 100) : 0}% от всех
                    </span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Оценок выставлено</span>
                    <span className={styles.metricValue}>{k.new_grades_period}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>за период</span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Учеников</span>
                    <span className={styles.metricValue}>{k.students_total}</span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Учителей</span>
                    <span className={styles.metricValue}>{k.teachers_total}</span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricLabel}>Школьных админов</span>
                    <span className={styles.metricValue}>{k.admins_total}</span>
                </div>
            </div>

            {/* График активности */}
            <div className={styles.card} style={{ marginTop: 20 }}>
                <div className={styles.cardTitle}>Активность платформы по дням</div>
                <div style={{ height: 280 }}>
                    <Line data={lineData} options={lineOptions} />
                </div>
            </div>

            {/* Сравнение школ */}
            <div className={styles.card} style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div className={styles.cardTitle} style={{ marginBottom: 0 }}>Сравнение школ</div>
                    <a href="/system-admin/schools" style={{ color: 'var(--accent, #a78bfa)', fontSize: '0.85rem' }}>
                        Управление школами →
                    </a>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                <th style={{ padding: '8px 6px' }}>Школа</th>
                                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Учеников</th>
                                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Учителей</th>
                                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Классов</th>
                                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Активных</th>
                                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Ср. балл</th>
                                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Оценок</th>
                                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Выдано LVK</th>
                                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Потрачено LVK</th>
                                <th style={{ padding: '8px 6px', textAlign: 'right' }}>Статус</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedSchools.length === 0 && (
                                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Нет школ</td></tr>
                            )}
                            {sortedSchools.map(s => (
                                <tr key={s.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '8px 6px' }}>
                                        <a href={`/system-admin/schools?id=${s.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }}>
                                            {s.name}
                                        </a>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.timezone}</div>
                                    </td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{s.students}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{s.teachers}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{s.classes}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{s.active_users}</td>
                                    <td style={{
                                        padding: '8px 6px', textAlign: 'right', fontWeight: 600,
                                        color: s.avg_grade >= 4 ? '#2ecc71' : s.avg_grade >= 3 ? '#f1c40f' : s.avg_grade > 0 ? '#e74c3c' : 'var(--text-muted)',
                                    }}>
                                        {s.avg_grade > 0 ? s.avg_grade.toFixed(2) : '—'}
                                    </td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>{s.grades_count}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right', color: '#2ecc71' }}>+{s.lvk_distributed}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right', color: '#e74c3c' }}>−{s.lvk_spent}</td>
                                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: 12,
                                            fontSize: '0.75rem',
                                            background: s.is_active ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)',
                                            color: s.is_active ? '#2ecc71' : '#e74c3c',
                                        }}>
                                            {s.is_active ? 'активна' : 'стоп'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Распределение ролей */}
            <div className={styles.card} style={{ marginTop: 20 }}>
                <div className={styles.cardTitle}>Распределение ролей</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    {data.role_distribution.map(r => (
                        <div key={r.role} style={{
                            padding: '12px 14px',
                            background: 'var(--bg-tertiary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 8,
                        }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                {ROLE_LABELS[r.role] ?? r.role}
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                {r.count}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
