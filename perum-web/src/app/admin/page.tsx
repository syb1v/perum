'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

import { useAuth } from '@/context/AuthContext';
import AdminSidebar from '@/components/admin/AdminSidebar';
import styles from './page.module.css';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { isAdmin } from '@/lib/roles';

// Динамические импорты для вкладок (Next.js Code Splitting)
// Это решает проблему предзагрузки лишних CSS и скриптов вкладок, на которых пользователь еще не находится
const AdminDashboardTab = dynamic(() => import('@/components/admin/AdminDashboardTab'), { loading: () => <LoadingScreen /> });
const DeepEconomyTab = dynamic(() => import('@/components/admin/DeepEconomyTab'), { loading: () => <LoadingScreen /> });
const PerformanceTab = dynamic(() => import('@/components/admin/PerformanceTab'), { loading: () => <LoadingScreen /> });
const UserManagement = dynamic(() => import('@/components/admin/UserManagement'), { loading: () => <LoadingScreen /> });

const Registration = dynamic(() => import('@/components/admin/Registration'), { loading: () => <LoadingScreen /> });
const NotificationManager = dynamic(() => import('@/components/admin/NotificationManager'), { loading: () => <LoadingScreen /> });
const SubjectManagement = dynamic(() => import('@/components/admin/SubjectManagement'), { loading: () => <LoadingScreen /> });
import api from '@/lib/apiClient';

const TeacherAssignments = dynamic(() => import('@/components/admin/TeacherAssignments'), { loading: () => <LoadingScreen /> });

const ClassManagement = dynamic(() => import('@/components/admin/ClassManagement'), { loading: () => <LoadingScreen /> });

const QuestManagement = dynamic(() => import('@/components/admin/QuestManagement'), { loading: () => <LoadingScreen /> });

const InquiryManagement = dynamic(() => import('@/components/admin/InquiryManagement'), { loading: () => <LoadingScreen /> });
const NewsManagement = dynamic(() => import('@/components/admin/NewsManagement'), { loading: () => <LoadingScreen /> });
const SupportInbox = dynamic(() => import('@/components/admin/SupportInbox'), { loading: () => <LoadingScreen /> });
const ExchangeManagement = dynamic(() => import('@/components/admin/ExchangeManagement'), { loading: () => <LoadingScreen /> });
const MarketManagement = dynamic(() => import('@/components/admin/MarketManagement'), { loading: () => <LoadingScreen /> });
const SchoolPeriods = dynamic(() => import('@/components/admin/SchoolPeriods'), { loading: () => <LoadingScreen /> });
const SystemSettings = dynamic(() => import('@/components/admin/SystemSettings'), { loading: () => <LoadingScreen /> });
const WorkTypeManagement = dynamic(() => import('@/components/admin/WorkTypeManagement'), { loading: () => <LoadingScreen /> });

const AcademicYearSection = dynamic(() => import('@/components/admin/AcademicYearSection'), { loading: () => <LoadingScreen /> });
const ControlWorksSection = dynamic(() => import('@/components/admin/ControlWorksSection'), { loading: () => <LoadingScreen /> });
const BellSchedulesManager = dynamic(() => import('@/components/admin/BellSchedulesManager'), { loading: () => <LoadingScreen /> });

// Placeholder components
// const UsersSection = () => <div className={styles.card}>Users Management (Coming Soon)</div>;
// const RegisterSection = () => <div className={styles.card}>Registration (Coming Soon)</div>;
// const NotificationsSection = () => <div className={styles.card}>Notifications (Coming Soon)</div>;
// const SubjectsSection = () => <div className={styles.card}>Subjects (Coming Soon)</div>;
// const TeachersSection = () => <div className={styles.card}>Teachers (Coming Soon)</div>;
// const ClassesSection = () => <div className={styles.card}>Classes (Coming Soon)</div>;
// const QuestsSection = () => <div className={styles.card}>Quests (Coming Soon)</div>;
// const InquiriesSection = () => <div className={styles.card}>Inquiries (Coming Soon)</div>;
// const NewsSection = () => <div className={styles.card}>News (Coming Soon)</div>;

type AdminSection = 'dashboard' | 'deep-economy' | 'performance' | 'users' | 'register' | 'notifications' | 'subjects' | 'teachers-subjects' | 'classes' | 'quests' | 'inquiries' | 'news' | 'market' | 'exchange' | 'academic-years' | 'school-periods' | 'control-works' | 'bell-schedules' | 'work-types' | 'school-settings' | 'support';

export default function AdminDashboard() {
    const { user, isLoading, logout } = useAuth();
    const initializeSection = (): AdminSection => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('admin_active_section');
            if (saved) return saved as AdminSection;
        }
        return 'dashboard';
    };

    const [activeSection, setActiveSection] = useState<AdminSection>(initializeSection);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleSectionChange = useCallback((s: string) => {
        setActiveSection(s as AdminSection);
        if (typeof window !== 'undefined') {
            localStorage.setItem('admin_active_section', s);
        }
        setSidebarOpen(false);
    }, []);

    // Block body scroll when sidebar is open on mobile
    useEffect(() => {
        if (sidebarOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [sidebarOpen]);

    // Role check is handled by AdminLayout — this is just a safety fallback.
    // Use the shared isAdmin() so org_admin (new org-level role) is recognised.
    if (isLoading || !user || !isAdmin(user.role)) {
        return <LoadingScreen />;
    }

    const renderSection = () => {
        switch (activeSection) {
            case 'dashboard': return <AdminDashboardTab />;
            case 'deep-economy': return <DeepEconomyTab />;
            case 'performance': return <PerformanceTab />;
            case 'users': return <UserManagement />;
            case 'register': return <Registration />;
            case 'notifications': return <NotificationManager />;
            case 'subjects': return <SubjectManagement />;
            case 'teachers-subjects': return <TeacherAssignments />;
            case 'classes': return <ClassManagement />;
            case 'quests': return <QuestManagement />;
            case 'inquiries': return <InquiryManagement />;
            case 'news': return <NewsManagement />;
            case 'support': return <SupportInbox />;
            case 'market': return <MarketManagement />;
            case 'exchange': return <ExchangeManagement />;
            case 'academic-years': return <AcademicYearSection />;
            case 'school-periods': return <SchoolPeriods />;
            case 'control-works': return <ControlWorksSection />;
            case 'bell-schedules': return <BellSchedulesWrapper />;
            case 'work-types': return <WorkTypeManagement />;
            case 'school-settings': return <SystemSettings />;
            default: return <UserManagement />;
        }
    };

    const sectionTitles: Record<string, string> = {
        dashboard: 'Обзор школы',
        'deep-economy': 'Глубокая экономика',
        performance: 'Успеваемость',
        users: 'Пользователи',
        register: 'Регистрация',
        notifications: 'Уведомления',
        subjects: 'Предметы',
        'teachers-subjects': 'Учителя',
        classes: 'Классы',
        quests: 'Квесты',
        inquiries: 'Обращения',
        news: 'Новости',
        support: 'Почта поддержки',
        market: 'Маркет',
        exchange: 'Управление биржей',
        'academic-years': 'Учебные года',
        'school-periods': 'Учебные периоды',
        'control-works': 'КР и СР',
        'bell-schedules': 'Расписание звонков',
        'work-types': 'Виды работ',
        'school-settings': 'Настройки школы'
    };

    return (
        <div className={styles.adminContainer}>
            {/* Mobile overlay */}
            {sidebarOpen && <div className={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />}

            <div className={`${styles.sidebarMobileWrap} ${sidebarOpen ? styles.sidebarMobileOpen : ''}`}>
                <AdminSidebar
                    activeSection={activeSection}
                    onSectionChange={handleSectionChange}
                    onLogout={logout}
                />
            </div>

            <main className={styles.mainContent}>
                <header className={styles.contentHeader}>
                    <div className={styles.headerLeft}>
                        <button className={styles.menuToggle} onClick={() => setSidebarOpen(v => !v)} aria-label="Меню">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </svg>
                        </button>
                        <h1 className={styles.pageTitle}>{sectionTitles[activeSection]}</h1>
                    </div>
                    <div className={styles.headerRight}>
                        <button
                            onClick={async () => {
                                try {
                                    await api.post('/admin/system/clear-cache');
                                    alert('Кэш успешно очищен');
                                } catch {
                                    alert('Ошибка очистки кэша');
                                }
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                padding: '6px 14px',
                                borderRadius: '8px',
                                fontSize: '14px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="1 4 1 10 7 10"></polyline>
                                <polyline points="23 20 23 14 17 14"></polyline>
                                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                            </svg>
                            Сбросить кэш
                        </button>
                        <div className={styles.userInfo}>
                            <span className={styles.userName}>{user.first_name || user.login}</span>
                            <div className={styles.userAvatar}>
                                {user?.avatar_url ? (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={user.avatar_url} alt="Аватар профиля" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                <div className={styles.contentSection}>
                    {renderSection()}
                </div>
            </main>
        </div>
    );
}

function BellSchedulesWrapper() {
    return (
        <Suspense fallback={<div style={{ padding: '20px' }}><div className={styles.spinner}></div></div>}>
            <BellSchedulesManager />
        </Suspense>
    );
}
