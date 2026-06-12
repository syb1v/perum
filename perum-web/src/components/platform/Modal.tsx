'use client';

import styles from '@/app/admin/page.module.css';

export default function Modal({
  title, onClose, children, footer, width = 620,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', padding: 16 }}
      onClick={onClose}
    >
      <div
        className={styles.card}
        style={{ width: `min(${width}px, 100%)`, maxHeight: '86vh', overflow: 'auto', margin: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 className={styles.cardTitle} style={{ margin: 0 }}>{title}</h2>
          <button className={styles.actionBtn} onClick={onClose} aria-label="Закрыть">✕</button>
        </div>
        {children}
        {footer && <div className={styles.formActions} style={{ marginTop: 18 }}>{footer}</div>}
      </div>
    </div>
  );
}
