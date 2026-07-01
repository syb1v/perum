'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import SettingsModal from '@/components/modals/SettingsModal';
import ChangePasswordModal from '@/components/modals/ChangePasswordModal';
import WalletHistoryModal from '@/components/modals/WalletHistoryModal';
import { CoinIcon } from '@/components/ui/CoinIcon';
import styles from './Header.module.css';

/* ────── SVG icon components matching vanilla exactly ────── */
function LogoIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 12L22 16L16 20L10 16L16 12Z" fill="white" />
        </svg>
    );
}

function NavIcon({ icon }: { icon: string }) {
    switch (icon) {
        case 'home': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
        case 'book': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
        case 'trending': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
        case 'shop': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>;
        case 'chart': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>;
        case 'calendar': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
        case 'users': return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
        default: return null;
    }
}

/* ────── Navigation configs ────── */
const STUDENT_NAV = [
    { href: '/dashboard', label: 'Главная', icon: 'home' },
    { href: '/schedule', label: 'Учёба', icon: 'book' },
    { href: '/exchange', label: 'Биржа', icon: 'trending' },
    { href: '/market', label: 'Маркет', icon: 'shop' },
];

const TEACHER_NAV = [
    { href: '/dashboard', label: 'Главная', icon: 'home' },
    { href: '/journal', label: 'Журнал', icon: 'book' },
    { href: '/topics', label: 'Темы', icon: 'chart' },
    { href: '/analytics', label: 'Аналитика', icon: 'chart' },
    { href: '/homeroom', label: 'Мой класс', icon: 'users' },
];

interface Notification {
    id: string;
    title: string;
    message: string;
    time: string;
    type: 'info' | 'success' | 'warning';
}

export default function Header() {
    const { user, logout } = useAuth();
    const pathname = usePathname();

    const [menuOpen, setMenuOpen] = useState(false);
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const [settingsOpen, setSettingsOpen] = useState(false);
    const [changePwdOpen, setChangePwdOpen] = useState(false);
    const [walletHistoryOpen, setWalletHistoryOpen] = useState(false);

    const menuRef = useRef<HTMLDivElement>(null);
    const notifRef = useRef<HTMLDivElement>(null);

    const role = user?.role || 'student';
    const navItems = ['teacher', 'homeroom_teacher', 'class_teacher'].includes(role || '') ? TEACHER_NAV : (role === 'student' ? STUDENT_NAV : []);
    const displayName = [user?.last_name, user?.first_name].filter(Boolean).join(' ') || user?.login || 'Пользователь';

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const clearAll = useCallback(() => {
        setNotifications([]);
    }, []);

    return (
        <>
            <div className={styles.headerBlur} />
            <header className={styles.header}>
                {/* ── Left: Logo + Title ── */}
                <Link href="/dashboard" className={styles.logoLink}>
                    <div className={styles.logo}>
                        <LogoIcon />
                    </div>
                    <span className={styles.title}>ПЭРУМ</span>
                </Link>

                {/* ── Desktop Navigation ── */}
                <nav className={styles.nav}>
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.navItem} ${pathname === item.href ? styles.navActive : ''}`}
                        >
                            <NavIcon icon={item.icon} />
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </nav>

                {/* Notification bell (direct child for independent positioning on mobile) */}
                <div className={styles.notifWrapper} ref={notifRef}>
                    <button
                        className={styles.headerBtn}
                        onClick={() => setNotifOpen(!notifOpen)}
                        aria-label="Уведомления"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                        {notifications.length > 0 && (
                            <span className={styles.badge}>{notifications.length}</span>
                        )}
                    </button>

                    <div className={`${styles.notifDropdown} ${notifOpen ? styles.notifDropdownOpen : ''}`}>
                        <div className={styles.notifHeader}>
                            <h4>Уведомления</h4>
                            {notifications.length > 0 && (
                                <button className={styles.clearAllBtn} onClick={clearAll}>Очистить все</button>
                            )}
                        </div>
                        {notifications.length > 0 ? (
                            <div className={styles.notifList}>
                                {notifications.map((n) => (
                                    <div key={n.id} className={styles.notifItem}>
                                        <div>
                                            <div className={styles.notifTitle}>{n.title}</div>
                                            <div className={styles.notifMessage}>{n.message}</div>
                                            <div className={styles.notifTime}>{n.time}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className={styles.notifEmpty}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                                </svg>
                                <p>Нет новых уведомлений</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right side ── */}
                <div className={styles.right}>
                    {/* Balance (student only) */}
                    {role === 'student' && (
                        <div className={styles.balance}>
                            <span className={styles.balanceValue}>{user?.balance ?? 0}</span>
                            <CoinIcon id="coinGradientHeader" className={styles.coinIcon} />
                        </div>
                    )}

                    {/* User menu */}
                    <div className={`${styles.userMenu} ${menuOpen ? styles.userMenuOpen : ''}`} ref={menuRef}>
                        <button
                            className={styles.userMenuBtn}
                            onClick={() => setMenuOpen(!menuOpen)}
                            aria-label="Меню пользователя"
                        >
                            <div className={styles.avatarSmall}>
                                {user?.avatar_url ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={user.avatar_url} alt="Аватар профиля" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                )}
                            </div>
                            <span className={styles.userName}>{displayName}</span>
                            <svg className={styles.chevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>

                        <div className={styles.dropdownMenu}>
                            {role === 'student' && (
                                <>
                                    <div className={styles.walletSection}>
                                        <div className={styles.walletRow}>
                                            <span className={styles.walletLabel}>Баланс</span>
                                            <span className={styles.walletValue}>
                                                <span>{user?.balance ?? 0}</span>
                                                <CoinIcon id="coinGradientDropdown" className={styles.coinIcon} />
                                            </span>
                                        </div>
                                        <button className={styles.historyBtn} onClick={() => { setMenuOpen(false); setWalletHistoryOpen(true); }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                                                <polyline points="17 6 23 6 23 12" />
                                            </svg>
                                            <span>История транзакций</span>
                                        </button>
                                    </div>
                                    <div className={styles.dropdownDivider} />
                                </>
                            )}

                            <Link
                                href="/profile"
                                className={styles.dropdownItem}
                                onClick={() => setMenuOpen(false)}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                               <span>Профиль</span>
                            </Link>

                            {(user?.role === 'admin' || user?.role === 'school_admin') && (
                                <Link href="/admin/" className={styles.dropdownItem} onClick={() => setMenuOpen(false)}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    </svg>
                                    <span>Панель управления</span>
                                </Link>
                            )}

                            <button className={styles.dropdownItem} onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                                <span>Настройки</span>
                            </button>

                            <button className={`${styles.dropdownItem} ${styles.logout}`} onClick={() => { setMenuOpen(false); logout(); }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                <span>Выход</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Modals */}
                <SettingsModal
                    isOpen={settingsOpen}
                    onClose={() => setSettingsOpen(false)}
                    onOpenChangePassword={() => {
                        setSettingsOpen(false);
                        setChangePwdOpen(true);
                    }}
                />
                <ChangePasswordModal
                    isOpen={changePwdOpen}
                    onClose={() => setChangePwdOpen(false)}
                />
                <WalletHistoryModal
                    isOpen={walletHistoryOpen}
                    onClose={() => setWalletHistoryOpen(false)}
                />
            </header>
        </>
    );
}
