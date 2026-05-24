'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Header from '@/components/layout/Header';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { ROLES, getDashboardPath } from '@/lib/roles';

export default function ParentLayout({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && user && user.role !== ROLES.PARENT) {
            router.replace(getDashboardPath(user.role));
        }
    }, [user, isLoading, router]);

    if (isLoading || !user || user.role !== ROLES.PARENT) {
        return <LoadingScreen />;
    }

    return (
        <div style={{ minHeight: '100vh' }}>
            <Header />
            <main style={{ paddingTop: 'var(--header-height, 90px)', paddingBottom: 40, minHeight: '100vh' }}>
                {children}
            </main>
        </div>
    );
}
