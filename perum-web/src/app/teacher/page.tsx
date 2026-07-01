'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/apiClient';
import NewsWidget from '@/components/dashboard/NewsWidget';
import TeacherScheduleWidget from '@/components/dashboard/TeacherScheduleWidget';
import DeliveryCodeWidget from '@/components/dashboard/DeliveryCodeWidget';
import { useToast } from '@/context/ToastContext';
import styles from './page.module.css';

type MainTab = 'main' | 'news';

export default function TeacherDashboard() {
    const { token } = useAuth(); // ensure auth context is active
    const { showSuccess } = useToast();
    const [activeTab, setActiveTab] = useState<MainTab>('main');

    // Unread news logic
    const [unreadNews, setUnreadNews] = useState(0);
    useEffect(() => {
        if (!token) return;
        api.get<{ unread_count: number }>('/news/unread-count')
            .then(res => setUnreadNews(res.unread_count))
            .catch(() => {});

        const handleNewsRead = () => setUnreadNews(prev => Math.max(0, prev - 1));
        window.addEventListener('news_read', handleNewsRead);
        return () => window.removeEventListener('news_read', handleNewsRead);
    }, [token]);

    return (
        <div className={styles.dashboard}>
            <div className={styles.tabsHeader}>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'main' ? styles.activeTab : ''}`}
                    onClick={() => setActiveTab('main')}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                    <span>Главная</span>
                </button>
                <button
                    className={`${styles.tabBtn} ${activeTab === 'news' ? styles.activeTab : ''}`}
                    onClick={() => setActiveTab('news')}
                    style={{ position: 'relative' }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
                    <span>Новости</span>
                    {unreadNews > 0 && (
                        <span style={{
                            position: 'absolute', top: '0', right: '-8px',
                            background: '#ef4444', color: 'white', fontSize: '10px',
                            fontWeight: 'bold', padding: '2px 5px', borderRadius: '10px',
                            minWidth: '16px', textAlign: 'center', lineHeight: 1
                        }}>
                            {unreadNews}
                        </span>
                    )}
                </button>
            </div>

            {activeTab === 'main' && (
                <div className={styles.contentGrid}>
                    <div className={styles.scheduleWidget}>
                        <TeacherScheduleWidget />
                    </div>
                    {token && (
                        <div className={styles.sidebar}>
                            <DeliveryCodeWidget 
                                token={token} 
                                onDeliverySuccess={() => {
                                    showSuccess('Товар успешно выдан!');
                                    setTimeout(() => window.location.reload(), 1500);
                                }} 
                            />
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'news' && (
                <div className={styles.newsContainer}>
                    <NewsWidget limit={10} />
                </div>
            )}
        </div>
    );
}
