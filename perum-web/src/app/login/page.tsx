'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ApiClientError } from '@/lib/apiClient';
import styles from './page.module.css';

export default function LoginPage() {
    const { login, isLoading } = useAuth();
    const { showError } = useToast();
    const [loginVal, setLoginVal] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);

    if (isLoading) {
        return (
            <div className={styles['auth-container']}>
                <div className={styles.loader}>
                    <div className={styles.spinner} />
                </div>
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginVal.trim() || !password.trim()) {
            showError('Введите логин и пароль');
            return;
        }
        setSubmitting(true);
        try {
            await login({ login: loginVal.trim(), password: password, remember_me: rememberMe });
        } catch (err) {
            if (err instanceof ApiClientError) {
                showError(err.message);
            } else {
                showError('Произошла ошибка при входе');
            }
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={styles['auth-container']}>
            <div className={styles['bg-gradient']} />
            <div className={`${styles['bg-blur-circle']} ${styles['circle-1']}`} />
            <div className={`${styles['bg-blur-circle']} ${styles['circle-2']}`} />
            <div className={styles['auth-card']}>
                <div className={styles['auth-header']}>
                    <div className={styles['logo']}>
                        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M16 12L22 16L16 20L10 16L16 12Z" fill="white" />
                        </svg>
                    </div>
                    <h1 className={styles['auth-title']}>Вход в систему</h1>
                    <p className={styles['auth-subtitle']}>Введите логин и пароль для входа</p>
                </div>

                <form onSubmit={handleSubmit} className={styles['auth-form']}>
                    <div className={styles['form-group']}>
                        <label htmlFor="login">Логин</label>
                        <div className={styles['input-wrapper']}>
                            <svg className={styles['input-icon']} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                            <input
                                id="login"
                                name="username"
                                type="text"
                                value={loginVal}
                                onChange={(e) => setLoginVal(e.target.value)}
                                placeholder="Введите логин"
                                autoComplete="username"
                                disabled={submitting}
                            />
                        </div>
                    </div>

                    <div className={styles['form-group']}>
                        <label htmlFor="password">Пароль</label>
                        <div className={styles['input-wrapper']}>
                            <svg className={styles['input-icon']} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" />
                                <path d="M7 11V7a5 5 0 0110 0v4" />
                            </svg>
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Введите пароль"
                                autoComplete="current-password"
                                disabled={submitting}
                            />
                            <button
                                type="button"
                                className={styles['toggle-password']}
                                onClick={() => setShowPassword(!showPassword)}
                                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                            >
                                {showPassword ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className={styles['form-options']}>
                        <label className={styles['checkbox-wrapper']}>
                            <input
                                type="checkbox"
                                id="remember-me"
                                name="remember"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                            />
                            <span className={styles['checkmark']}></span>
                            <span>Запомнить меня</span>
                        </label>
                    </div>

                    <button type="submit" className={`${styles['btn-primary']} ${submitting ? styles['loading'] : ''}`} disabled={submitting}>
                        <span>Войти</span>
                        <svg className={styles['btn-arrow']} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12,5 19,12 12,19" />
                        </svg>
                    </button>
                </form>
            </div>
        </div>
    );
}
