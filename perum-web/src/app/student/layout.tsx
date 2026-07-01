'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import LoadingScreen from '@/components/ui/LoadingScreen';
import styles from './layout.module.css';
import SupportFAB from '@/components/ui/SupportFAB';
import { ROLES, getDashboardPath } from '@/lib/roles';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && user && user.role !== ROLES.STUDENT) {
            router.replace(getDashboardPath(user.role));
        }
    }, [user, isLoading, router]);

    if (isLoading || !user || user.role !== ROLES.STUDENT) {
        return <LoadingScreen />;
    }

    return (
        <div className={styles.shell}>
            <Header />
            <main className={styles.main}>{children}</main>
            <SupportFAB />
            <MobileNav />
        </div>
    );
}
