'use client';

import { useState } from 'react';
import styles from '@/app/admin/page.module.css';

export type NavItem = { id: string; label: string; icon: React.ReactNode; badge?: number };

/**
 * Общий app-shell для консолей платформы (ядро) и организации — тот же визуальный
 * язык, что у админки школы (импортирует её CSS-модуль): фикс-сайдбар 240px,
 * sticky-топбар, мобильный off-canvas drawer. Разделы переключаются по `active`.
 */
export default function ConsoleShell({
  nav, active, onChange, title, subtitle, userLabel, onLogout, headerActions, children,
}: {
  nav: NavItem[];
  active: string;
  onChange: (id: string) => void;
  title: string;
  subtitle?: string;
  userLabel?: string;
  onLogout: () => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.adminContainer}>
      {open && <div className={styles.sidebarOverlay} onClick={() => setOpen(false)} />}
      <div className={`${styles.sidebarMobileWrap} ${open ? styles.sidebarMobileOpen : ''}`}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader} style={{ cursor: 'default' }}>
            <div className={styles.logo}>
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M16 12L22 16L16 20L10 16L16 12Z" fill="white" />
              </svg>
            </div>
            <span className={styles.logoText}>ПЭРУМ</span>
          </div>
          <nav className={styles.sidebarNav}>
            {nav.map((item) => (
              <button
                key={item.id}
                className={`${styles.navItem} ${active === item.id ? styles.active : ''}`}
                onClick={() => { onChange(item.id); setOpen(false); }}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge ? <span className={styles.navBadge}>{item.badge}</span> : null}
              </button>
            ))}
          </nav>
          <div className={styles.sidebarFooter}>
            <button className={styles.logoutBtn} onClick={onLogout}>
              <Icon.Logout />
              <span>Выход</span>
            </button>
          </div>
        </aside>
      </div>
      <main className={styles.mainContent}>
        <header className={styles.contentHeader}>
          <div className={styles.headerLeft}>
            <button className={styles.menuToggle} onClick={() => setOpen((v) => !v)} aria-label="Меню">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
            </button>
            <div>
              <h1 className={styles.pageTitle}>{title}</h1>
              {subtitle && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{subtitle}</div>}
            </div>
          </div>
          <div className={styles.headerRight}>
            {headerActions}
            {userLabel && (
              <span className={styles.userInfo}>
                <span className={styles.userAvatar}>{(userLabel[0] || '?').toUpperCase()}</span>
                <span className={styles.userName}>{userLabel}</span>
              </span>
            )}
          </div>
        </header>
        <div className={styles.contentSection}>{children}</div>
      </main>
    </div>
  );
}

const S = (p: React.SVGProps<SVGSVGElement>) => ({ width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p });

export const Icon = {
  Dashboard: () => (<svg {...S({})}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>),
  Org: () => (<svg {...S({})}><path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" /><path d="M9 9h.01M9 12h.01M9 15h.01M9 18h.01" /></svg>),
  School: () => (<svg {...S({})}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>),
  Users: () => (<svg {...S({})}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>),
  Billing: () => (<svg {...S({})}><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>),
  Release: () => (<svg {...S({})}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>),
  Mail: () => (<svg {...S({})}><path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>),
  Logout: () => (<svg {...S({})}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>),
};
