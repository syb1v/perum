'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { AttentionStudent } from '@/types';
import styles from '../../app/teacher/analytics/page.module.css';

interface AttentionStudentsProps {
    students: AttentionStudent[];
}

const ITEMS_PER_PAGE = 10;

export default function AttentionStudents({ students }: AttentionStudentsProps) {
    const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
    const observerTarget = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setDisplayCount(ITEMS_PER_PAGE);
    }, [students]);

    const handleObserver = useCallback(
        (entries: IntersectionObserverEntry[]) => {
            const [target] = entries;
            if (target.isIntersecting && displayCount < (students?.length || 0)) {
                setDisplayCount((prev) => prev + ITEMS_PER_PAGE);
            }
        },
        [displayCount, students]
    );

    useEffect(() => {
        const observer = new IntersectionObserver(handleObserver, {
            root: null,
            rootMargin: '20px',
            threshold: 1.0,
        });

        if (observerTarget.current) observer.observe(observerTarget.current);

        return () => {
            if (observerTarget.current) observer.unobserve(observerTarget.current); // eslint-disable-line react-hooks/exhaustive-deps
        };
    }, [handleObserver]);

    if (!students || students.length === 0) {
        return <div className={styles.emptyState}>Нет учеников, требующих внимания</div>;
    }

    const getGradeClass = (grade: number) => {
        if (grade >= 4.0) return styles.indicatorGood;
        if (grade >= 3.0) return styles.indicatorMedium;
        return styles.indicatorBad;
    };

    const displayedStudents = students.slice(0, displayCount);

    return (
        <div className={styles.list}>
            {displayedStudents.map((student) => (
                <div key={student.id} className={styles.item}>
                    <span className={styles.itemName}>{student.name}</span>
                    <div className={styles.itemStats}>
                        <span className={`${styles.statValue} ${getGradeClass(student.avg)}`}>
                            {student.avg.toFixed(2)}
                        </span>
                        <span className={styles.statLabel}>двоек: {student.twos}</span>
                    </div>
                </div>
            ))}
            {displayCount < students.length && (
                <div ref={observerTarget} style={{ height: '20px', width: '100%' }} />
            )}
        </div>
    );
}
