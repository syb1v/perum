'use client';

import { useEffect, useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: ReactNode;
    size?: 'default' | 'lg' | 'xl' | 'xxl';
    children: ReactNode;
    footer?: ReactNode;
    className?: string;
    bodyFlex?: boolean;
}

export default function Modal({ isOpen, onClose, title, size = 'default', children, footer, className, bodyFlex = false }: ModalProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    const handleEsc = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleEsc);
            document.documentElement.classList.add('modal-open');
            document.body.classList.add('modal-open');
        }
        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.documentElement.classList.remove('modal-open');
            document.body.classList.remove('modal-open');
        };
    }, [isOpen, handleEsc]);

    if (!isOpen || !mounted) return null;

    const sizeClass = size === 'lg' ? styles.lg : size === 'xl' ? styles.xl : size === 'xxl' ? styles.xxl : '';

    return createPortal(
        <div className={styles.overlay}>
            <div className={styles.backdrop} onClick={onClose} />
            <div className={`${styles.content} ${sizeClass} ${className || ''}`}>
                {title && (
                    <div className={styles.header}>
                        <h3>{title}</h3>
                        <button className={styles.close} onClick={onClose} aria-label="Закрыть">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                )}
                <div className={bodyFlex ? styles.bodyFlex : styles.body}>{children}</div>
                {footer && <div className={styles.footer}>{footer}</div>}
            </div>
        </div>,
        document.body
    );
}
