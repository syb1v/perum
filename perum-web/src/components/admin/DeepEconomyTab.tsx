'use client';

import { useState, useEffect } from 'react';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement,
    LineElement, Title, Tooltip, Filler, Legend, ArcElement,
} from 'chart.js';
import { Line, Pie } from 'react-chartjs-2';
import api from '@/lib/apiClient';
import { DeepEconomyResponse } from '@/types';
import styles from './AdminDashboardTab.module.css';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend, ArcElement
);

export default function DeepEconomyTab() {
    const [stats, setStats] = useState<DeepEconomyResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState(30);

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            try {
                const data = await api.get<DeepEconomyResponse>(`/admin/dashboard/deep-economy?period_days=${period}`);
                setStats(data);
            } catch (err) {
                console.error('Ошибка загрузки глубокой экономики:', err);
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
        return <div style={{ color: 'red', marginTop: 20 }}>Ошибка при получении данных экономики.</div>;
    }

    // Линейный график "Доходы vs Расходы"
    const lineData = {
        labels: stats.daily_stats.map(d => d.date),
        datasets: [
            {
                label: 'Заработано юзерами',
                data: stats.daily_stats.map(d => d.income),
                borderColor: '#2ecc71',
                backgroundColor: 'rgba(46, 204, 113, 0.1)',
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: '#2ecc71',
                fill: true,
                tension: 0.4
            },
            {
                label: 'Потрачено юзерами',
                data: stats.daily_stats.map(d => d.expense),
                borderColor: '#e74c3c',
                backgroundColor: 'rgba(231, 76, 60, 0.0)',
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: '#e74c3c',
                fill: false,
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
            y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.03)', drawBorder: false }, ticks: { color: '#8f9bb3' } },
            x: { grid: { display: false }, ticks: { color: '#8f9bb3', maxRotation: 0, autoSkipPadding: 20 } }
        },
        maintainAspectRatio: false,
        interaction: { mode: 'nearest' as const, axis: 'x' as const, intersect: false }
    };

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.dashboardHeader}>
                <div className={styles.headerTitle}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                    Глубокая Экономика
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
                    <span className={styles.metricValue} style={{ color: 'var(--success)' }}>+{stats.total_distributed} LVK</span>
                    <span className={styles.metricLabel}>Суммарно заработано за период</span>
                </div>
                <div className={styles.metricCard}>
                    <span className={styles.metricValue} style={{ color: 'var(--error)' }}>-{stats.total_spent} LVK</span>
                    <span className={styles.metricLabel}>Суммарно потрачено за период</span>
                </div>
            </div>

            <div className={styles.chartContainerWrapper} style={{ marginTop: '24px' }}>
                <div className={styles.chartTitle}>Финансовый поток по дням</div>
                <div className={styles.chartBody}>
                    <Line data={lineData} options={lineOptions} />
                </div>
            </div>

            <div className={styles.tablesGridTwo} style={{ marginTop: '24px' }}>
                <div className={styles.tableCard}>
                    <div className={styles.tableHeader}>Детализация заработка</div>
                    <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                        {stats.income_sources && stats.income_sources.length > 0 ? (
                            <Pie
                                data={{
                                    labels: stats.income_sources.map(s => {
                                        if (s.source === 'grade') return 'Отличные оценки';
                                        if (s.source === 'quest') return 'Выполнение квестов';
                                        if (s.source === 'dividend') return 'Биржевые дивиденды';
                                        return s.source;
                                    }),
                                    datasets: [{
                                        data: stats.income_sources.map(s => s.amount),
                                        backgroundColor: ['#2ecc71', '#3498db', '#9b59b6', '#f1c40f'],
                                        borderWidth: 0,
                                    }]
                                }}
                                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#8f9bb3' } } } }}
                            />
                        ) : <div style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>Нет данных</div>}
                    </div>
                </div>
                <div className={styles.tableCard}>
                    <div className={styles.tableHeader}>Детализация трат</div>
                    <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                        {stats.expense_sources && stats.expense_sources.length > 0 ? (
                            <Pie
                                data={{
                                    labels: stats.expense_sources.map(s => {
                                        if (s.source === 'purchase') return 'Покупки на Маркете';
                                        if (s.source === 'investment') return 'Вложения в акции';
                                        if (s.source === 'grade_penalty') return 'Плохие оценки (штрафы)';
                                        return s.source;
                                    }),
                                    datasets: [{
                                        data: stats.expense_sources.map(s => s.amount),
                                        backgroundColor: ['#e74c3c', '#e67e22', '#c0392b', '#d35400'],
                                        borderWidth: 0,
                                    }]
                                }}
                                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#8f9bb3' } } } }}
                            />
                        ) : <div style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>Нет данных</div>}
                    </div>
                </div>
            </div>

            <div className={styles.tablesGridTwo} style={{ marginTop: '24px' }}>
                <div className={styles.tableCard}>
                    <div className={styles.tableHeader}>Покупки по категориям Маркета</div>
                    <div style={{ height: '250px', display: 'flex', justifyContent: 'center' }}>
                        {stats.market_categories && stats.market_categories.length > 0 ? (
                            <Pie
                                data={{
                                    labels: stats.market_categories.map(s => {
                                        if (s.category === 'avatar') return 'Аватары';
                                        if (s.category === 'background') return 'Фоны профиля';
                                        if (s.category === 'boost') return 'Бусты';
                                        if (s.category === 'certificate') return 'Сертификаты';
                                        return s.category;
                                    }),
                                    datasets: [{
                                        data: stats.market_categories.map(s => s.amount),
                                        backgroundColor: ['#e74c3c', '#e67e22', '#3498db', '#9b59b6', '#2ecc71', '#f1c40f'],
                                        borderWidth: 0,
                                    }]
                                }}
                                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#8f9bb3' } } } }}
                            />
                        ) : <div style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>Нет данных</div>}
                    </div>
                </div>

                <div className={styles.tableCard}>
                    <div className={styles.tableHeader}>Топ покупаемых предметов (LVK)</div>
                    <table className={styles.analyticsTable}>
                        <thead>
                            <tr>
                                <th>Предмет</th>
                                <th className={styles.rightAlign}>Потрачено</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.market_items && stats.market_items.map((item) => (
                                <tr key={item.item_id}>
                                    <td>{item.item_name}</td>
                                    <td className={styles.rightAlign} style={{ color: 'var(--error)' }}>
                                        {item.amount}
                                    </td>
                                </tr>
                            ))}
                            {(!stats.market_items || stats.market_items.length === 0) && (
                                <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Нет данных</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className={styles.tableCard} style={{ marginTop: '24px' }}>
                <div className={styles.tableHeader}>Распределение экономики по классам</div>
                <table className={styles.analyticsTable}>
                    <thead>
                        <tr>
                            <th>Класс</th>
                            <th className={styles.rightAlign}>Заработано</th>
                            <th className={styles.rightAlign}>Потрачено</th>
                            <th className={styles.rightAlign}>Сальдо</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.class_stats && [...stats.class_stats].sort((a, b) => (b.income - b.expense) - (a.income - a.expense)).map((c) => {
                            const saldo = c.income - c.expense;
                            return (
                                <tr key={c.class_id || `unknown-${c.class_name}`}>
                                    <td>{c.class_name}</td>
                                    <td className={styles.rightAlign} style={{ color: 'var(--success)' }}>+{c.income}</td>
                                    <td className={styles.rightAlign} style={{ color: 'var(--error)' }}>-{c.expense}</td>
                                    <td className={styles.rightAlign} style={{ color: saldo > 0 ? 'var(--success)' : saldo < 0 ? 'var(--error)' : 'var(--text-secondary)' }}>
                                        {saldo > 0 ? `+${saldo}` : saldo}
                                    </td>
                                </tr>
                            );
                        })}
                        {(!stats.class_stats || stats.class_stats.length === 0) && (
                            <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Нет данных</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className={styles.tableCard} style={{ marginTop: '24px' }}>
                <div className={styles.tableHeader}>Недавние транзакции</div>
                <table className={styles.analyticsTable}>
                    <thead>
                        <tr>
                            <th>Пользователь</th>
                            <th>Тип</th>
                            <th>Описание</th>
                            <th>Дата</th>
                            <th className={styles.rightAlign}>Сумма</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.recent_large_transactions.map((tr) => (
                            <tr key={tr.id}>
                                <td>{tr.user_name} (@{tr.user_login})</td>
                                <td>{
                                    tr.type === 'grade' ? 'Оценка' :
                                        tr.type === 'quest' ? 'Квест' :
                                            tr.type === 'purchase' ? 'Покупка' :
                                                tr.type === 'investment' ? 'Вклад' :
                                                    tr.type === 'grade_penalty' ? 'Штраф' :
                                                        tr.type === 'dividend' ? 'Дивиденд' : tr.type
                                }</td>
                                <td>{tr.description || '-'}</td>
                                <td style={{ color: 'var(--text-secondary)' }}>{new Date(tr.created_at).toLocaleString('ru-RU')}</td>
                                <td className={styles.rightAlign} style={{ color: tr.amount > 0 ? 'var(--success)' : 'var(--error)' }}>
                                    {tr.amount > 0 ? `+${tr.amount}` : tr.amount} LVK
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
