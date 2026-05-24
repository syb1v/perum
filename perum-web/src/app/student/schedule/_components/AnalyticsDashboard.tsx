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
import { GradeRow, AnalyticsResponse } from '@/hooks/useSchedule';
import styles from '../page.module.css';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
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
        .sort((a, b) => a.name.localeCompare(b.name));

    const sortedDates = Array.from(allDatesSet).sort().reverse();

    const globalAvg = gradesData.length > 0 ? (
        gradesData.reduce((s, g) => s + g.value * (g.weight || 1), 0) /
        gradesData.reduce((s, g) => s + (g.weight || 1), 0)
    ).toFixed(2) : '—';

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
            <div className={styles.card} style={{ marginBottom: 0 }}>
                <h4 className={styles.sectionTitle} style={{ marginBottom: '16px' }}>📊 Средний балл по предметам</h4>
                <div style={{ position: 'relative', height: `${Math.max(250, subjectsList.length * 40)}px`, width: '100%' }}>
                    <Bar
                        options={{
                            indexAxis: 'y',
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                                    titleFont: { size: 13 },
                                    bodyFont: { size: 13 },
                                    padding: 12,
                                    cornerRadius: 8,
                                }
                            },
                            scales: {
                                x: { min: 2, max: 5, grid: { color: 'rgba(0,0,0,0.05)' } },
                                y: { grid: { display: false } }
                            }
                        }}
                        data={{
                            labels: subjectsList.map(s => s.name),
                            datasets: [{
                                label: 'Средний балл',
                                data: subjectsList.map(s => s.avg),
                                backgroundColor: subjectsList.map(s => getAvgColor(s.avg)),
                                borderRadius: 6,
                                barThickness: 20,
                            }]
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
