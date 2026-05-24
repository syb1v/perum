import styles from './Skeleton.module.css';

interface SkeletonProps {
    width?: string;
    height?: string;
    borderRadius?: string;
    className?: string;
}

export default function Skeleton({ width, height = '20px', borderRadius, className }: SkeletonProps) {
    return (
        <div
            className={`${styles.skeleton} ${className || ''}`}
            style={{ width, height, borderRadius }}
        />
    );
}

export function SkeletonCard() {
    return (
        <div className={styles.card}>
            <Skeleton width="60%" height="24px" />
            <Skeleton height="14px" />
            <Skeleton width="80%" height="14px" />
            <Skeleton width="40%" height="14px" />
        </div>
    );
}
