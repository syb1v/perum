'use client';

import { ReactNode, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { isAdmin, getDashboardPath } from '@/lib/roles';

export default function AdminLayout({ children }: { children: ReactNode }) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (isLoading) return;
        if (!user) {
            router.replace('/login?auth=required');
            return;
        }
        if (!isAdmin(user.role)) {
            router.replace(getDashboardPath(user.role));
        }
    }, [user, isLoading, router]);

    if (isLoading || !user || !isAdmin(user.role)) {
        return <LoadingScreen />;
    }

    return <>{children}</>;
}
