'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { ROLES, getDashboardPath } from '@/lib/roles';
import styles from './page.module.css';

const navSections = [
    {
        category: 'Мониторинг',
        items: [
            { href: '/system-admin', label: 'Обзор платформы', icon: '📊' },
        ]
    },
    {
        category: 'Управление',
        items: [
            { href: '/system-admin/schools', label: 'Школы (Тенанты)', icon: '🏫' },
        ]
    }
];

export default function SystemAdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, isLoading } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (isLoading) return;
        if (!user) {
            router.replace('/login?auth=required');
            return;
        }
        if (user.role !== ROLES.SYSTEM_ADMIN) {
            router.replace(getDashboardPath(user.role));
        }
    }, [user, isLoading, router]);

    useEffect(() => {
        if (sidebarOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [sidebarOpen]);

    if (isLoading || !user || user.role !== ROLES.SYSTEM_ADMIN) {
        return <LoadingScreen />;
    }

    const pageTitleMap: Record<string, string> = {
        '/system-admin': 'Обзор платформы',
        '/system-admin/schools': 'Управление школами',
    };

    return (
        <div className={styles.systemLayout}>
            {sidebarOpen && <div className={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />}

            <aside className={`${styles.sidebar} ${sidebarOpen ? styles.mobileOpen : ''}`}>
                <div className={styles.sidebarHeader}>
                    <div className={styles.sidebarLogo}>
                        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                            <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M16 12L22 16L16 20L10 16L16 12Z" fill="white"/>
                        </svg>
                    </div>
                    <div className={styles.sidebarTitle}>
                        <span className={styles.sidebarBrand}>ПЭРУМ</span>
                        <span className={styles.sidebarSubtitle}>Система</span>
                    </div>
                </div>

                <nav className={styles.sidebarNav}>
                    {navSections.map(section => (
                        <div key={section.category} className={styles.navCategory}>
                            <div className={styles.navCategoryLabel}>{section.category}</div>
                            {section.items.map(item => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`${styles.navLink} ${pathname === item.href ? styles.active : ''}`}
                                    onClick={() => setSidebarOpen(false)}
                                >
                                    <span>{item.icon}</span>
                                    <span>{item.label}</span>
                                </Link>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className={styles.sidebarFooter}>
                    <button
                        className={styles.backLink}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                        onClick={async () => {
                            try { await fetch('/api/logout', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` } }); } catch { /* ignore */ }
                            localStorage.removeItem('auth_token');
                            sessionStorage.removeItem('auth_token');
                            document.cookie = 'next_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                            window.location.href = '/login';
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Выйти из системы
                    </button>
                </div>
            </aside>

            <main className={styles.mainContent}>
                <header className={styles.contentHeader}>
                    <div className={styles.headerLeft}>
                        <button className={styles.menuToggle} onClick={() => setSidebarOpen(v => !v)} aria-label="Меню">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </svg>
                        </button>
                        <h1 className={styles.pageTitle}>{pageTitleMap[pathname] || 'Системная панель'}</h1>
                    </div>
                    <div className={styles.headerRight}>
                        <span className={styles.envBadge}>Production</span>
                    </div>
                </header>

                {children}
            </main>
        </div>
    );
}
