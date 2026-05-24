'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Баннер «Добавить на главный экран».
 * Показывается один раз — после отклонения/принятия запоминается в localStorage.
 */
export default function PWAInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Регистрируем service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {/* silence */});
        }

        // Уже установлено или уже отказались
        if (
            window.matchMedia('(display-mode: standalone)').matches ||
            localStorage.getItem('pwa_dismissed')
        ) return;

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setVisible(true);
        };

        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    if (!visible) return null;

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            localStorage.setItem('pwa_dismissed', '1');
        }
        setVisible(false);
        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        localStorage.setItem('pwa_dismissed', '1');
        setVisible(false);
    };

    return (
        <div
            role="dialog"
            aria-label="Установить приложение"
            style={{
                position: 'fixed',
                bottom: '80px',
                left: '12px',
                right: '12px',
                zIndex: 1100,
                background: 'var(--card-bg, #1e2130)',
                border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: '16px',
                padding: '16px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                animation: 'pwaSlideUp 0.3s ease',
            }}
        >
            <style>{`
                @keyframes pwaSlideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
            `}</style>

            {/* Иконка */}
            <div style={{
                width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                    stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                </svg>
            </div>

            {/* Текст */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
                    Установить ПЭРУМ
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                    Добавьте на главный экран для быстрого доступа
                </div>
            </div>

            {/* Кнопки */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flexShrink: 0 }}>
                <button
                    onClick={handleInstall}
                    style={{
                        padding: '6px 14px', borderRadius: '8px', border: 'none',
                        background: 'var(--accent-primary, #6366f1)', color: '#fff',
                        fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                        whiteSpace: 'nowrap',
                    }}
                >
                    Установить
                </button>
                <button
                    onClick={handleDismiss}
                    style={{
                        padding: '4px 14px', borderRadius: '8px', border: 'none',
                        background: 'transparent', color: 'var(--text-muted)',
                        fontSize: '0.78rem', cursor: 'pointer',
                    }}
                >
                    Не сейчас
                </button>
            </div>
        </div>
    );
}
