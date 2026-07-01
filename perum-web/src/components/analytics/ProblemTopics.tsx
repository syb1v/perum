'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ProblemTopic } from '@/types';
import styles from '../../app/teacher/analytics/page.module.css';

interface ProblemTopicsProps {
    topics: ProblemTopic[];
}

const ITEMS_PER_PAGE = 10;

export default function ProblemTopics({ topics }: ProblemTopicsProps) {
    const [displayCount, setDisplayCount] = useState(ITEMS_PER_PAGE);
    const observerTarget = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setDisplayCount(ITEMS_PER_PAGE);
    }, [topics]);

    const handleObserver = useCallback(
        (entries: IntersectionObserverEntry[]) => {
            const [target] = entries;
            if (target.isIntersecting && displayCount < (topics?.length || 0)) {
                setDisplayCount((prev) => prev + ITEMS_PER_PAGE);
            }
        },
        [displayCount, topics]
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

    if (!topics || topics.length === 0) {
        return <div className={styles.emptyState}>Нет проблемных тем</div>;
    }

    const getGradeClass = (grade: number) => {
        if (grade >= 4.0) return styles.indicatorGood;
        if (grade >= 3.0) return styles.indicatorMedium;
        return styles.indicatorBad;
    };

    const displayedTopics = topics.slice(0, displayCount);

    return (
        <div className={styles.list}>
            {displayedTopics.map((topic, index) => (
                <div key={index} className={styles.item}>
                    <span className={styles.itemName}>{topic.name}</span>
                    <div className={styles.itemStats}>
                        <span className={`${styles.statValue} ${getGradeClass(topic.avg)}`}>
                            {topic.avg.toFixed(2)}
                        </span>
                        <span className={styles.statLabel}>{topic.bad_ratio}</span>
                    </div>
                </div>
            ))}
            {displayCount < topics.length && (
                <div ref={observerTarget} style={{ height: '20px', width: '100%' }} />
            )}
        </div>
    );
}
