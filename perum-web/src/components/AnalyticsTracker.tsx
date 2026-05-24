'use client';

import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import api from '@/lib/apiClient';

function TrackerInner() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    useEffect(() => {
        if (!pathname) return;

        const trackVisit = async () => {
            // Не отправляем аналитику, если пользователь не авторизован
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            // Простейшая проверка на мобильное устройство
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            try {
                await api.post('/admin/analytics/track', {
                    path: pathname,
                    referrer: document.referrer || null,
                    user_agent: navigator.userAgent,
                    is_mobile: isMobile
                });
            } catch {
                // Молчаливый фейл для аналитики, чтобы не спамить консоль пользователя
            }
        };

        // Небольшая задержка, чтобы учесть загрузку страницы
        const timeout = setTimeout(trackVisit, 1000);

        return () => clearTimeout(timeout);
    }, [pathname, searchParams]);

    return null;
}

export default function AnalyticsTracker() {
    return (
        <Suspense fallback={null}>
            <TrackerInner />
        </Suspense>
    );
}
