'use client';

import { useState } from 'react';
import { useEffect } from 'react';
import api from '@/lib/apiClient';
import SchoolSupportModal from '@/components/support/SchoolSupportModal';
import type { SupportUnread } from '@/types/support';
import styles from './SupportFAB.module.css';

/**
 * Floating Action Button для быстрого доступа к поддержке.
 * Добавляется в student/layout.tsx и teacher/layout.tsx.
 */
export default function SupportFAB() {
    const [open, setOpen] = useState(false);
    const [unread, setUnread] = useState(0);

    useEffect(() => {
        const load = () => api.get<SupportUnread>('/support/unread-count').then(data => setUnread(data.messages)).catch(() => undefined);
        void load();
        const timer = window.setInterval(load, 30000);
        window.addEventListener('focus', load);
        return () => { window.clearInterval(timer); window.removeEventListener('focus', load); };
    }, []);

    return (
        <>
            <button
                className={styles.fab}
                onClick={() => setOpen(true)}
                aria-label="Помощь и поддержка"
            >
                {/* Иконка поддержки (чат-пузырь) — как в профиле */}
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    <path d="M12 7v2" />
                    <path d="M12 13h.01" />
                </svg>
                {unread > 0 && <span className={styles.badge}>{unread > 99 ? '99+' : unread}</span>}
            </button>

            {open && <SchoolSupportModal onClose={() => { setOpen(false); api.get<SupportUnread>('/support/unread-count').then(data => setUnread(data.messages)).catch(() => undefined); }} />}
        </>
    );
}
