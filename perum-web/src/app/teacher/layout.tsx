'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import LoadingScreen from '@/components/ui/LoadingScreen';
import SupportFAB from '@/components/ui/SupportFAB';
import { isTeacher, getDashboardPath } from '@/lib/roles';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && user && !isTeacher(user.role)) {
            router.replace(getDashboardPath(user.role));
        }
    }, [user, isLoading, router]);

    if (isLoading || !user || !isTeacher(user.role)) {
        return <LoadingScreen />;
    }

    return (
        <div style={{ minHeight: '100vh' }}>
            <Header />
            <main style={{ paddingTop: 'var(--header-height, 90px)', paddingBottom: 100, minHeight: '100vh' }}>
                {children}
            </main>
            <SupportFAB />
            <MobileNav />
        </div>
    );
}
