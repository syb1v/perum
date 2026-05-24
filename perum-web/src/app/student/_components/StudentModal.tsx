'use client';

import Modal from '@/components/ui/Modal';
import type { LeaderboardEntry } from '@/types';
import styles from '../page.module.css';

interface StudentModalProps {
    entry: LeaderboardEntry;
    onClose: () => void;
}

export default function StudentModal({ entry, onClose }: StudentModalProps) {
    const className = entry.student.class_name || '—';
    const avg = entry.avg.toFixed(2);
    const posCount = entry.positive_count || 0;
    const totalCount = entry.grades_count || 0;
    const rank = entry.rank;
    const posPercent = totalCount > 0 ? Math.round((posCount / totalCount) * 100) : 0;

    let justification = null;
    if (rank <= 3) {
        const medals: Record<number, string> = { 1: '🥇 Золото', 2: '🥈 Серебро', 3: '🥉 Бронза' };
        justification = <div className={styles.lbStudentMedal}>{medals[rank]}</div>;
    }

    return (
        <Modal isOpen={true} onClose={onClose} title="Информация об ученике" size="lg">
            <div className={styles.lbStudentStats}>
                <div className={styles.lbStatCard}>
                    <div className={styles.lbStatValue}>#{rank}</div>
                    <div className={styles.lbStatLabel}>Место</div>
                </div>
                <div className={styles.lbStatCard}>
                    <div className={styles.lbStatValue}>{avg}</div>
                    <div className={styles.lbStatLabel}>Ср. балл</div>
                </div>
                <div className={styles.lbStatCard}>
                    <div className={styles.lbStatValue}>{className}</div>
                    <div className={styles.lbStatLabel}>Класс</div>
                </div>
            </div>
            {justification}
            <div className={styles.lbStudentDetails}>
                <h4>Обоснование позиции</h4>
                <div className={styles.lbDetailRow}>
                    <span className={styles.lbDetailLabel}>Положительных оценок (4 и 5)</span>
                    <span className={styles.lbDetailValue}>{posCount} из {totalCount} ({posPercent}%)</span>
                </div>
                <div className={styles.lbDetailRow}>
                    <span className={styles.lbDetailLabel}>Общее количество оценок</span>
                    <span className={styles.lbDetailValue}>{totalCount}</span>
                </div>
                <div className={styles.lbDetailExplanation}>
                    <p>Место определяется последовательно: сначала по среднему баллу, затем по количеству положительных оценок, и наконец по общему числу оценок.</p>
                </div>
            </div>
        </Modal>
    );
}
