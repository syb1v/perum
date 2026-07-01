'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTokenPayload, papi, setPlatformToken } from '@/lib/platformApi';
// Та же дизайн-система, что и у логина школы — единый CSS-модуль (без дублирования).
import styles from '@/app/login/page.module.css';

export default function PlatformLogin() {
  const router = useRouter();
  const [loginVal, setLoginVal] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginVal.trim() || !password.trim()) {
      setErr('Введите логин и пароль');
      return;
    }
    setErr('');
    setSubmitting(true);
    try {
      const data = await papi('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login: loginVal.trim(), password }),
      });
      setPlatformToken(data.access_token, rememberMe);
      const role = getTokenPayload()?.role;
      router.push(role === 'org_admin' ? '/platform/org' : '/platform');
    } catch (e: any) {
      setErr(e?.message || 'Ошибка входа');
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
          <p className={styles['auth-subtitle']}>Панель управления платформой</p>
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
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? 'platform-login-error' : undefined}
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
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? 'platform-login-error' : undefined}
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
                disabled={submitting}
              />
              <span className={styles['checkmark']}></span>
              <span>Запомнить меня</span>
            </label>
          </div>

          {err && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 14px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--error)',
                fontSize: '0.8125rem',
                lineHeight: 1.4,
              }}
              id="platform-login-error"
              role="alert"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{err}</span>
            </div>
          )}

          <button type="submit" className={`${styles['btn-primary']} ${submitting ? styles['loading'] : ''}`} disabled={submitting} aria-busy={submitting}>
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
