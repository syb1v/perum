'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import SettingsModal from '@/components/modals/SettingsModal';
import ChangePasswordModal from '@/components/modals/ChangePasswordModal';
import WalletHistoryModal from '@/components/modals/WalletHistoryModal';
import { CoinIcon } from '@/components/ui/CoinIcon';
import styles from './MobileNav.module.css';

/* ────── Nav configs matching vanilla mobile-nav exactly ────── */
const STUDENT_TABS = [
    { href: '/dashboard', label: 'Главная', icon: 'home' },
    { href: '/schedule', label: 'Учёба', icon: 'book' },
    { href: '/exchange', label: 'Биржа', icon: 'trending' },
    { href: '/market', label: 'Маркет', icon: 'shop' },
];

const TEACHER_TABS = [
    { href: '/dashboard', label: 'Главная', icon: 'home' },
    { href: '/journal', label: 'Журнал', icon: 'journal' },
    { href: '/analytics', label: 'Аналитика', icon: 'chart' },
    { href: '/homeroom', label: 'Мой класс', icon: 'users' },
];

/* ────── Coin SVG matching vanilla ────── */


function TabIcon({ icon, active }: { icon: string; active: boolean }) {
    const color = active ? 'var(--accent-tertiary)' : 'currentColor';
    switch (icon) {
        case 'home': return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
        case 'book': return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
        case 'trending': return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
        case 'shop': return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>;
        case 'journal': return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>;
        case 'chart': return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>;
        case 'user': return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
        case 'users': return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
        default: return null;
    }
}

export default function MobileNav() {
    const { user, logout } = useAuth();
    const pathname = usePathname();
    const [popupOpen, setPopupOpen] = useState(false);

    // Modals
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [changePwdOpen, setChangePwdOpen] = useState(false);
    const [walletOpen, setWalletOpen] = useState(false);

    const role = user?.role || 'student';
    const tabs = ['teacher', 'homeroom_teacher', 'class_teacher'].includes(role || '') ? TEACHER_TABS : (role === 'student' ? STUDENT_TABS : []);

    const displayName = [user?.last_name, user?.first_name].filter(Boolean).join(' ') || user?.login || 'Пользователь';

    return (
        <>
            <div className={styles.navBlur} />
            {/* ── Bottom Navigation Bar ── */}
            <nav className={styles.nav}>
                {tabs.map((tab) => {
                    const isActive = pathname === tab.href;
                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            className={`${styles.tab} ${isActive ? styles.tabActive : ''} `}
                        >
                            <TabIcon icon={tab.icon} active={isActive} />
                            <span className={styles.tabLabel}>{tab.label}</span>
                        </Link>
                    );
                })}
                {/* Profile button */}
                <button
                    className={`${styles.tab} ${pathname.includes('/profile') ? styles.tabActive : ''} `}
                    onClick={() => setPopupOpen(!popupOpen)}
                >
                    <TabIcon icon="user" active={pathname.includes('/profile') || popupOpen} />
                    <span className={styles.tabLabel}>Профиль</span>
                </button>
            </nav>

            {/* ── Profile Popup (bottom sheet style) ── */}
            {popupOpen && (
                <div className={styles.popup}>
                    <div className={styles.popupBackdrop} onClick={() => setPopupOpen(false)} />
                    <div className={styles.popupContent}>
                        {/* Header */}
                        <div className={styles.popupHeader}>
                            <h3>Профиль</h3>
                            <button className={styles.popupClose} onClick={() => setPopupOpen(false)}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        {/* User info */}
                        <div className={styles.popupUser}>
                            <div className={styles.popupAvatar}>
                                {user?.avatar_url ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={user.avatar_url} alt="Аватар профиля" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                ) : (
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                )}
                            </div>
                            <div className={styles.popupInfo}>
                                <span className={styles.popupName}>{displayName}</span>
                                <span className={styles.popupRole}>
                                    {role === 'student' ? 'Ученик' : ['teacher', 'homeroom_teacher', 'class_teacher'].includes(role || '') ? 'Учитель' : 'Админ'}
                                </span>
                            </div>
                        </div>

                        {/* Wallet section (student only) */}
                        {role === 'student' && (
                            <div className={styles.walletSection}>
                                <div className={styles.walletRow}>
                                    <span className={styles.walletLabel}>Баланс</span>
                                    <span className={styles.walletValue}>
                                        <div className={styles.mobileBalance}>
                                            <CoinIcon id="coinGradientMobile" className={styles.coinIcon} />
                                            <span>{user?.balance ?? 0}</span>
                                        </div>
                                    </span>
                                </div>
                                <button className={styles.historyBtn} onClick={() => { setPopupOpen(false); setWalletOpen(true); }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                                        <polyline points="17 6 23 6 23 12" />
                                    </svg>
                                    <span>История транзакций</span>
                                </button>
                            </div>
                        )}

                        {/* Menu items */}
                        <div className={styles.popupMenu}>
                            <Link
                                href="/profile"
                                className={styles.popupItem}
                                onClick={() => setPopupOpen(false)}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                                <span>Мой профиль</span>
                            </Link>

                            <button className={styles.popupItem} onClick={() => { setPopupOpen(false); setSettingsOpen(true); }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                                <span>Настройки</span>
                            </button>

                            <button className={`${styles.popupItem} ${styles.logoutItem} `} onClick={() => { setPopupOpen(false); logout(); }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                    <polyline points="16 17 21 12 16 7" />
                                    <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                                <span>Выход</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
            {/* Wallet History Modal */}
            <WalletHistoryModal
                isOpen={walletOpen}
                onClose={() => setWalletOpen(false)}
            />
        </>
    );
}
