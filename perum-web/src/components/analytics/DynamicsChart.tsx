'use client';

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import { DynamicsPoint } from '@/types';
import styles from '../../app/teacher/analytics/page.module.css';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    annotationPlugin
);

interface DynamicsChartProps {
    data: DynamicsPoint[];
    avgGrade?: number;
}

export default function DynamicsChart({ data, avgGrade }: DynamicsChartProps) {
    if (!data || data.length === 0) {
        return <div className={styles.emptyState}>Нет данных для графика</div>;
    }

    const labels = data.map(d => new Date(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
    const values = data.map(d => d.avg);

    const chartData = {
        labels,
        datasets: [
            {
                label: 'Средний балл',
                data: values,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#6366f1',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }
        ]
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                backgroundColor: '#1a1a2e',
                titleColor: '#fff',
                bodyColor: '#94a3b8',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                padding: 12,
                displayColors: false
            },
            annotation: avgGrade ? {
                annotations: {
                    avgLine: {
                        type: 'line' as const,
                        yMin: avgGrade,
                        yMax: avgGrade,
                        borderColor: 'rgba(245, 158, 11, 0.6)',
                        borderWidth: 2,
                        borderDash: [6, 4],
                        label: {
                            display: true,
                            content: `Ср: ${avgGrade.toFixed(2)}`,
                            position: 'end' as const,
                            backgroundColor: 'rgba(245, 158, 11, 0.85)',
                            color: '#fff',
                            font: { size: 11, weight: 'bold' as const },
                            padding: { top: 3, bottom: 3, left: 6, right: 6 },
                            borderRadius: 4,
                        }
                    }
                }
            } : {}
        },
        scales: {
            y: {
                min: 2.0,
                max: 5.0,
                ticks: {
                    color: '#9898a6',
                    stepSize: 0.5
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)'
                }
            },
            x: {
                ticks: {
                    color: '#9898a6'
                },
                grid: {
                    display: true,
                    color: 'rgba(255, 255, 255, 0.1)',
                    borderDash: [5, 5]
                }
            }
        }
    };

    return (
        <div className={styles.chartContainer}>
            <Line data={chartData} options={options} />
        </div>
    );
}
