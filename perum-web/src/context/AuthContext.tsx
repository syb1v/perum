'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/apiClient';
import { getDashboardPath, ROLES, isAdmin } from '@/lib/roles';
import type { User, LoginRequest, LoginResponse } from '@/types';
import { useToast } from './ToastContext';
import LoadingScreen from '@/components/ui/LoadingScreen';

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (credentials: LoginRequest) => Promise<void>;
    token: string | null;
    getAuthToken: () => string | null;
    clearAuthToken: () => void;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const PUBLIC_PATHS = ['/', '/login'];

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const { showSuccess, showInfo, showError } = useToast();

    const refreshUser = useCallback(async () => {
        try {
            const userData = await api.get<User>(`/user/me?t=${Date.now()}`);
            setUser(userData);
        } catch {
            setUser(null);
        }
    }, []);

    const getAuthToken = useCallback(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
        }
        return null;
    }, []);

    const clearAuthToken = useCallback(() => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem('auth_token');
            sessionStorage.removeItem('auth_token');
            document.cookie = "next_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
    }, []);

    const token = getAuthToken();

    // Check auth ONCE on mount — not on every pathname change
    useEffect(() => {
        const checkAuth = async () => {
            // Only attempt to fetch /user/me if there is some token or cookie indicating a possible session.
            const hasAuthData = typeof window !== 'undefined' && !!(
                localStorage.getItem('auth_token') || 
                sessionStorage.getItem('auth_token') || 
                document.cookie.includes('next_auth_token')
            );

            if (!hasAuthData) {
                setUser(null);
                setIsLoading(false);
                const currentPath = window.location.pathname;
                if (!PUBLIC_PATHS.includes(currentPath)) {
                    router.replace('/login?auth=required');
                }
                return;
            }

            try {
                const userData = await api.get<User>('/user/me');
                setUser(userData);

                // Redirect authenticated users from public pages to their dashboard
                const currentPath = window.location.pathname;
                if (PUBLIC_PATHS.includes(currentPath)) {
                    const dashboardPath = getDashboardPath(userData.role);
                    router.replace(dashboardPath);
                } else {
                    const rolePrefixes = ['/student', '/teacher'];
                    if (rolePrefixes.some(p => currentPath.startsWith(p))) {
                        router.replace('/dashboard');
                    }

                    if (currentPath === '/dashboard') {
                        if (userData.role === ROLES.SYSTEM_ADMIN) {
                            router.replace('/system-admin');
                        } else if (isAdmin(userData.role)) {
                            router.replace('/admin');
                        }
                    }
                }
            } catch {
                setUser(null);
                // Redirect unauthenticated users from protected pages to login
                const currentPath = window.location.pathname;
                if (!PUBLIC_PATHS.includes(currentPath)) {
                    router.replace('/login?auth=required');
                }
            } finally {
                setIsLoading(false);
            }
        };
        checkAuth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const handleAuthError = (e: Event) => {
            const customEvent = e as CustomEvent;
            clearAuthToken();
            setUser(null);
            showError(customEvent.detail?.message || 'Сессия истекла. Пожалуйста, войдите снова.');
            router.push('/login');
        };

        window.addEventListener('auth_error', handleAuthError);
        return () => {
            window.removeEventListener('auth_error', handleAuthError);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clearAuthToken, router]);

    const login = useCallback(async (credentials: LoginRequest) => {
        try {
            const data = await api.post<LoginResponse>('/login', credentials);
            if (data.token) {
                if (credentials.remember_me) {
                    localStorage.setItem('auth_token', data.token);
                    document.cookie = `next_auth_token=${data.token}; path=/; max-age=1209600; samesite=lax`;
                } else {
                    sessionStorage.setItem('auth_token', data.token);
                    document.cookie = `next_auth_token=${data.token}; path=/; samesite=lax`;
                }
            }
            const userData = await api.get<User>('/user/me');
            setUser(userData);
            const dashboardPath = getDashboardPath(userData.role);
            showSuccess(`Добро пожаловать, ${userData.first_name || userData.login}!`);
            window.location.href = dashboardPath;
        } catch (err: unknown) {
            // Error is re-thrown to be handled by the caller (LoginPage)
            throw err;
        }
    }, [showSuccess]);

    const logout = useCallback(async () => {
        try {
            await api.post('/logout');
        } catch { /* ignore */ }
        localStorage.removeItem('auth_token');
        sessionStorage.removeItem('auth_token');
        document.cookie = "next_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        setUser(null);
        showInfo('Вы вышли из системы');
        router.push('/login');
    }, [router, showInfo]);

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                isAuthenticated: !!user,
                login,
                token,
                getAuthToken,
                clearAuthToken,
                logout,
                refreshUser,
            }}
        >
            {isLoading ? <LoadingScreen /> : children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

