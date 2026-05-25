'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from '@/app/admin/page.module.css';

interface AdminSidebarProps {
    activeSection: string;
    onSectionChange: (section: string) => void;
    onLogout: () => void;
    inquiriesCount?: number;
    isOrgAdmin?: boolean;
}

type NavItem = { id: string; label: string; icon: React.ReactNode; badge?: number };
type NavCategory = { title: string; items: NavItem[] };

export default function AdminSidebar({ activeSection, onSectionChange, onLogout, inquiriesCount = 0, isOrgAdmin = false }: AdminSidebarProps) {
    const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
        'Организация': true,
        'Аналитика и Дашборд': true,
        'Учебный процесс': true,
        'Экономика и Маркет': true,
        'Пользователи и Контент': true,
        'Система': true
    });

    const toggleCategory = (title: string) => {
        setOpenCategories(prev => ({
            ...prev,
            [title]: !prev[title]
        }));
    };

    const categories: NavCategory[] = [
        ...(isOrgAdmin ? [{
            title: 'Организация',
            items: [
                { id: 'schools', label: 'Школы', icon: <SchoolIcon /> }
            ]
        }] : []),
        {
            title: 'Аналитика и Дашборд',
            items: [
                { id: 'dashboard', label: 'Обзор платформы', icon: <DashboardIcon /> },
                { id: 'deep-economy', label: 'Глубокая экономика', icon: <ExchangeIcon /> },
                { id: 'performance', label: 'Успеваемость', icon: <BookIcon /> }
            ]
        },
        {
            title: 'Учебный процесс',
            items: [
                { id: 'academic-years', label: 'Учебные года', icon: <CalendarIcon /> },
                { id: 'school-periods', label: 'Учебные периоды', icon: <CalendarIcon /> },
                { id: 'classes', label: 'Классы', icon: <SchoolIcon /> },
                { id: 'subjects', label: 'Предметы', icon: <BookIcon /> },
                { id: 'teachers-subjects', label: 'Учителя', icon: <UsersIcon /> },
                { id: 'bell-schedules', label: 'Расписание звонков', icon: <ClockIcon /> },
                { id: 'control-works', label: 'КР и СР', icon: <BookIcon /> },
                { id: 'work-types', label: 'Виды работ', icon: <TargetIcon /> }
            ]
        },
        {
            title: 'Экономика и Маркет',
            items: [
                { id: 'exchange', label: 'Управление биржей', icon: <ExchangeIcon /> },
                { id: 'market', label: 'Маркет', icon: <ShopIcon /> },
                { id: 'quests', label: 'Квесты', icon: <TargetIcon /> }
            ]
        },
        {
            title: 'Пользователи и Контент',
            items: [
                { id: 'users', label: 'Пользователи', icon: <UsersIcon /> },
                { id: 'register', label: 'Регистрация', icon: <RegisterIcon /> },
                { id: 'notifications', label: 'Уведомления', icon: <BellIcon /> },
                { id: 'inquiries', label: 'Обращения', icon: <MailIcon />, badge: inquiriesCount },
                { id: 'news', label: 'Новости', icon: <NewspaperIcon /> },
                { id: 'support', label: 'Поддержка (Почта)', icon: <MailIcon /> }
            ]
        },
        {
            title: 'Система',
            items: [
                { id: 'school-settings', label: 'Настройки школы', icon: <SettingsIcon /> }
            ]
        }
    ];

    return (
        <aside className={styles.sidebar}>
            <Link href="/dashboard" className={styles.sidebarHeader}>
                <div className={styles.logo}>
                    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M16 12L22 16L16 20L10 16L16 12Z" fill="white" />
                    </svg>
                </div>
                <span className={styles.logoText}>ПЭРУМ</span>
            </Link>

            <nav className={styles.sidebarNav}>
                {categories.map((category) => {
                    const isOpen = openCategories[category.title];
                    return (
                        <div key={category.title} className={styles.categoryWrap}>
                            <div
                                className={styles.categoryHeader}
                                onClick={() => toggleCategory(category.title)}
                            >
                                <span>{category.title}</span>
                                <svg
                                    className={`${styles.categoryHeaderIcon} ${isOpen ? styles.open : ''}`}
                                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                >
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </div>
                            {isOpen && (
                                <div className={styles.categoryItems}>
                                    {category.items.map((item) => (
                                        <button
                                            key={item.id}
                                            className={`${styles.navItem} ${activeSection === item.id ? styles.active : ''}`}
                                            onClick={() => onSectionChange(item.id)}
                                        >
                                            {item.icon}
                                            <span>{item.label}</span>
                                            {item.badge ? <span className={styles.navBadge}>{item.badge}</span> : null}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            <div className={styles.sidebarFooter}>
                <button className={styles.logoutBtn} onClick={onLogout}>
                    <LogOutIcon />
                    <span>Выход</span>
                </button>
            </div>
        </aside>
    );
}

// Icons
function DashboardIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
    );
}

function UsersIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

function RegisterIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
    );
}

function BellIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
    );
}

function BookIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
    );
}

function SchoolIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
    );
}

function TargetIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
    );
}

function MailIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
        </svg>
    );
}

function NewspaperIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" />
            <path d="M21 12h-8" />
            <path d="M21 16h-8" />
            <path d="M21 8h-8" />
            <path d="M7 8h.01" />
            <path d="M7 12h.01" />
            <path d="M7 16h.01" />
        </svg>
    );
}

function LogOutIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    );
}

function ExchangeIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
            <polyline points="17 6 23 6 23 12"></polyline>
        </svg>
    );
}

function ShopIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
    );
}

function CalendarIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
    );
}

function ClockIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
    );
}

function SettingsIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
    );
}
