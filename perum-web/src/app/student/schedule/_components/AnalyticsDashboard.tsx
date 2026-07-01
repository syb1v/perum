'use client';

import type { ScriptableContext } from 'chart.js';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Bar } from 'react-chartjs-2';
import { GradeRow, AnalyticsResponse } from '@/hooks/useSchedule';
import styles from '../page.module.css';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    annotationPlugin
);

interface AnalyticsDashboardProps {
    gradesData: GradeRow[];
    analyticsData: AnalyticsResponse | null;
}

export default function AnalyticsDashboard({ gradesData, analyticsData }: AnalyticsDashboardProps) {
    if (!gradesData.length && (!analyticsData || analyticsData.subjects.length === 0)) {
        return <div className={styles.emptyState}>Нет данных для анализа</div>;
    }

    const subjectMap: Record<number, { name: string; gradesByDate: Record<string, GradeRow[]>; avg: number }> = {};
    const allDatesSet = new Set<string>();
    
    gradesData.forEach(g => {
        if (!subjectMap[g.subject_id]) {
            subjectMap[g.subject_id] = { name: g.subject_name, gradesByDate: {}, avg: 0 };
        }
        const dateKey = g.date;
        allDatesSet.add(dateKey);
        if (!subjectMap[g.subject_id].gradesByDate[dateKey]) {
            subjectMap[g.subject_id].gradesByDate[dateKey] = [];
        }
        subjectMap[g.subject_id].gradesByDate[dateKey].push(g);
    });

    Object.values(subjectMap).forEach(s => {
        const allGrades = Object.values(s.gradesByDate).flat();
        if (allGrades.length > 0) {
            const totalWeightedSum = allGrades.reduce((sum, g) => sum + g.value * (g.weight || 1), 0);
            const totalWeight = allGrades.reduce((sum, g) => sum + (g.weight || 1), 0);
            s.avg = parseFloat((totalWeightedSum / totalWeight).toFixed(2));
        }
    });

    const subjectsList = Object.entries(subjectMap)
        .map(([id, data]) => ({ id: Number(id), ...data }))
        .sort((a, b) => b.avg - a.avg);

    const sortedDates = Array.from(allDatesSet).sort().reverse();

    const globalAvgNum = gradesData.length > 0 ? (
        gradesData.reduce((s, g) => s + g.value * (g.weight || 1), 0) /
        gradesData.reduce((s, g) => s + (g.weight || 1), 0)
    ) : null;
    const globalAvg = globalAvgNum !== null ? globalAvgNum.toFixed(2) : '—';

    const getAvgColor = (avg: number) => {
        if (avg >= 4.5) return '#10b981';
        if (avg >= 3.5) return '#8b5cf6';
        if (avg >= 2.5) return '#f59e0b';
        return '#ef4444';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div className={styles.card} style={{ textAlign: 'center', marginBottom: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Средний балл</div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: globalAvg !== '—' ? getAvgColor(parseFloat(globalAvg)) : 'var(--text-muted)' }}>{globalAvg}</div>
                </div>
                <div className={styles.card} style={{ textAlign: 'center', marginBottom: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Всего оценок</div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>{gradesData.length}</div>
                </div>
                <div className={styles.card} style={{ textAlign: 'center', marginBottom: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Предметов</div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)' }}>{subjectsList.length}</div>
                </div>
                <div className={styles.card} style={{ textAlign: 'center', marginBottom: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Пятёрок</div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#10b981' }}>{gradesData.filter(g => g.value === 5).length}</div>
                </div>
            </div>

            {/* Journal Table */}
            <div className={styles.journalCard}>
                <h4 className={styles.journalCardHeader}>📓 Электронный журнал</h4>
                <div className={styles.journalTableContainer}>
                    <table className={styles.journalTable}>
                        <thead>
                            <tr>
                                <th className={styles.journalSubjectCol}>Предмет</th>
                                {sortedDates.map((date, di) => {
                                    const d = new Date(date);
                                    const isTodayDate = d.toDateString() === new Date().toDateString();
                                    return (
                                        <th key={`dh_${di}`} className={`${styles.journalDateCol} ${isTodayDate ? styles.journalDateColToday : ''}`}>
                                            {d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                                        </th>
                                    );
                                })}
                                <th className={styles.journalAvgCol}>Ср.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {subjectsList.map((subj, idx) => {
                                const avgClass =
                                    subj.avg >= 4.5 ? styles.journalAvgExcellent :
                                        subj.avg >= 3.5 ? styles.journalAvgGood :
                                            subj.avg >= 2.5 ? styles.journalAvgSatisfactory :
                                                subj.avg > 0 ? styles.journalAvgBad : '';
                                return (
                                    <tr key={`journal_${subj.id}_${idx}`}>
                                        <td className={styles.journalSubjectName}>{subj.name}</td>
                                        {sortedDates.map((date, di) => {
                                            const cellGrades = subj.gradesByDate[date] || [];
                                            const isTodayDate = new Date(date).toDateString() === new Date().toDateString();
                                            return (
                                                <td key={`jc_${subj.id}_${di}`} className={`${styles.journalGradeCell} ${isTodayDate ? styles.journalGradeCellToday : ''}`}>
                                                    {cellGrades.map((g, gi) => (
                                                        <span
                                                            key={`jg_${g.id}_${gi}`}
                                                            className={`${styles.journalGrade} ${styles['journalGrade' + g.value] || ''}`}
                                                            title={`${g.type || 'Оценка'}${g.weight ? ` (x${g.weight})` : ''}`}
                                                        >
                                                            {g.value}
                                                        </span>
                                                    ))}
                                                </td>
                                            );
                                        })}
                                        <td className={`${styles.journalAvgCol} ${styles.journalAvgValue} ${avgClass}`}>
                                            {subj.avg ? subj.avg.toFixed(2) : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bar chart */}
            <div className={styles.card} style={{
                marginBottom: 0,
                background: 'linear-gradient(180deg, var(--bg-card) 0%, rgba(var(--bg-card-rgb, 18,22,33), 0.97) 100%)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 8px 32px rgba(0,0,0,0.06)',
                borderColor: 'rgba(255,255,255,0.06)',
            }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '20px' }}>
                    <h4 className={styles.sectionTitle} style={{ margin: 0 }}>📊 Средний балл по предметам</h4>
                    {globalAvgNum !== null && (
                        <span style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            background: 'var(--bg-tertiary)',
                            padding: '3px 10px',
                            borderRadius: '20px',
                        }}>
                            общий {globalAvg}
                        </span>
                    )}
                </div>
                <div style={{ position: 'relative', height: `${Math.max(280, subjectsList.length * 44)}px`, width: '100%' }}>
                    <Bar
                        options={{
                            indexAxis: 'y',
                            responsive: true,
                            maintainAspectRatio: false,
                            animation: {
                                duration: 800,
                                easing: 'easeOutQuart',
                            },
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                    titleFont: { size: 14, weight: 'bold' as const },
                                    bodyFont: { size: 13 },
                                    padding: 14,
                                    cornerRadius: 10,
                                    displayColors: false,
                                    callbacks: {
                                        label: (ctx: { raw: number }) => {
                                            const val = typeof ctx.raw === 'number' ? ctx.raw : 0;
                                            const diff = globalAvgNum !== null ? (val - globalAvgNum).toFixed(2) : null;
                                            const diffStr = diff ? (Number(diff) >= 0 ? `+${diff}` : diff) : '';
                                            return [
                                                `Средний балл: ${val.toFixed(2)}`,
                                                diff ? `Отклонение: ${diffStr}` : '',
                                            ].filter(Boolean).join('  ');
                                        },
                                    },
                                },
                                annotation: globalAvgNum !== null ? {
                                    annotations: {
                                        avgLine: {
                                            type: 'line' as const,
                                            xMin: globalAvgNum,
                                            xMax: globalAvgNum,
                                            borderColor: 'rgba(245, 158, 11, 0.7)',
                                            borderWidth: 2,
                                            borderDash: [8, 4],
                                            label: {
                                                display: true,
                                                content: `Общий ср. ${globalAvgNum.toFixed(2)}`,
                                                position: 'start' as const,
                                                backgroundColor: 'rgba(245, 158, 11, 0.9)',
                                                color: '#fff',
                                                font: { size: 11, weight: 'bold' as const },
                                                padding: { top: 4, bottom: 4, left: 8, right: 8 },
                                                borderRadius: 6,
                                            },
                                        },
                                    },
                                } : {},
                            },
                            scales: {
                                x: {
                                    min: 2,
                                    max: 5,
                                    grid: {
                                        color: 'rgba(128,128,128,0.08)',
                                    },
                                    ticks: {
                                        callback: (v: string | number) => (typeof v === 'number' ? v.toFixed(1) : v),
                                    },
                                },
                                y: {
                                    grid: { display: false },
                                    ticks: {
                                        font: { size: 12, weight: 'bold' as const },
                                    },
                                },
                            },
                        } as Record<string, unknown>}
                        data={{
                            labels: subjectsList.map(s => s.name),
                            datasets: [{
                                label: 'Средний балл',
                                data: subjectsList.map(s => s.avg),
                                backgroundColor: (ctx: ScriptableContext<'bar'>) => {
                                    const val = (ctx.raw as number) ?? 0;
                                    const chartCtx = ctx.chart.ctx;
                                    const gradient = chartCtx.createLinearGradient(0, 0, 400, 0);
                                    if (val >= 4.5) {
                                        gradient.addColorStop(0, 'rgba(16,185,129,0.7)');
                                        gradient.addColorStop(1, 'rgba(16,185,129,1)');
                                    } else if (val >= 3.5) {
                                        gradient.addColorStop(0, 'rgba(139,92,246,0.7)');
                                        gradient.addColorStop(1, 'rgba(139,92,246,1)');
                                    } else if (val >= 2.5) {
                                        gradient.addColorStop(0, 'rgba(245,158,11,0.7)');
                                        gradient.addColorStop(1, 'rgba(245,158,11,1)');
                                    } else {
                                        gradient.addColorStop(0, 'rgba(239,68,68,0.7)');
                                        gradient.addColorStop(1, 'rgba(239,68,68,1)');
                                    }
                                    return gradient;
                                },
                                borderRadius: 8,
                                barThickness: 22,
                                borderSkipped: false,
                            }],
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
