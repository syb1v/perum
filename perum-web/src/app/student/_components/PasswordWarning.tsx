'use client';

import { useAuth } from '@/context/AuthContext';
import { useState, useEffect } from 'react';
import styles from '../page.module.css';

interface PasswordWarningProps {
    onChangePassword: () => void;
}

export default function PasswordWarning({ onChangePassword }: PasswordWarningProps) {
    const { user } = useAuth();
    const [hidden, setHidden] = useState(true);

    useEffect(() => {
        // Prevent hydration mismatch by checking localStorage after mount
        const isHidden = localStorage.getItem('perum_pwd_warning_hidden');
        if (isHidden !== 'true') {
            setHidden(false);
        }
    }, []);

    if (!user || user.password_changed) {
        return null; // Пароль уже изменен
    }

    if (hidden) return null;

    const handleDismiss = () => {
        setHidden(true);
        localStorage.setItem('perum_pwd_warning_hidden', 'true');
    };

    return (
        <div className={styles.warningBanner}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Рекомендуем сменить пароль для безопасности аккаунта</span>
            <button className={styles.bannerBtn} onClick={onChangePassword}>Сменить пароль</button>
            <button className={styles.bannerClose} onClick={handleDismiss}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
}
