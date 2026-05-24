import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ROLES, ROLE_DASHBOARDS, isAdmin, isTeacher } from '@/lib/roles';
import { isPlatformHostname } from '@/lib/host';

/**
 * Middleware: clean-URL routing + базовый role-gating.
 *
 * SECURITY NOTE: роль читается из JWT без проверки подписи (edge runtime).
 * Middleware — UX-слой; реальный RBAC обеспечивает бэкенд. Любая мутация всё
 * равно пройдёт require_* dependency, так что подделка роли в токене на клиенте
 * даёт только редирект на чужой дашборд и 403 от API.
 */

const SHARED_PAGES: Record<string, Record<string, string>> = {
    '/dashboard': {
        student: '/student',
        teacher: '/teacher',
        homeroom_teacher: '/teacher',
        class_teacher: '/teacher',
        admin: '/admin',
        school_admin: '/admin',
        system_admin: '/system-admin',
        parent: '/parent',
    },
    '/profile': {
        student: '/student/profile',
        teacher: '/teacher/profile',
        homeroom_teacher: '/teacher/profile',
        class_teacher: '/teacher/profile',
        admin: '/admin',
        school_admin: '/admin',
        system_admin: '/system-admin',
        parent: '/parent',
    },
};

const STUDENT_PAGES: Record<string, string> = {
    '/exchange': '/student/exchange',
    '/market': '/student/market',
    '/schedule': '/student/schedule',
};

const TEACHER_PAGES: Record<string, string> = {
    '/journal': '/teacher/journal',
    '/analytics': '/teacher/analytics',
    '/topics': '/teacher/topics',
    '/homeroom': '/teacher/homeroom',
};

const LEGACY_REDIRECTS: Record<string, string> = {
    '/student': '/dashboard',
    '/student/profile': '/profile',
    '/student/exchange': '/exchange',
    '/student/market': '/market',
    '/student/schedule': '/schedule',
    '/teacher': '/dashboard',
    '/teacher/profile': '/profile',
    '/teacher/journal': '/journal',
    '/teacher/analytics': '/analytics',
    '/teacher/topics': '/topics',
};

function decodeJwtRole(cookieValue: string | undefined): string | null {
    if (!cookieValue) return null;
    try {
        const decodedCookie = decodeURIComponent(cookieValue);
        const token = decodedCookie.startsWith('Bearer ')
            ? decodedCookie.slice(7)
            : decodedCookie;
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        payload = payload + '='.repeat((4 - (payload.length % 4)) % 4);
        const decoded = JSON.parse(atob(payload));

        // Требуем структуру токена v1.6+ (id + session_token).
        if (!decoded.id || !decoded.session_token) return null;
        return decoded.role || null;
    } catch {
        return null;
    }
}

function redirectToLogin(request: NextRequest) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('auth', 'required');
    return NextResponse.redirect(url);
}

function redirectTo(request: NextRequest, pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    return NextResponse.redirect(url);
}

function rewriteTo(request: NextRequest, pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    return NextResponse.rewrite(url);
}

export function middleware(request: NextRequest) {
    // Platform host (admin.*) → serve /platform/*; skip the school role-routing.
    const host = request.headers.get('host') || '';
    if (isPlatformHostname(host)) {
        const p = request.nextUrl.pathname;
        if (
            p.startsWith('/platform') ||
            p.startsWith('/_next') ||
            p.startsWith('/api') ||
            p.includes('.')
        ) {
            return NextResponse.next();
        }
        const url = request.nextUrl.clone();
        url.pathname = `/platform${p === '/' ? '' : p}`;
        return NextResponse.rewrite(url);
    }

    const { pathname } = request.nextUrl;
    const cookie =
        request.cookies.get('next_auth_token')?.value ||
        request.cookies.get('access_token')?.value;
    const role = decodeJwtRole(cookie);

    const cleanPath = LEGACY_REDIRECTS[pathname];
    if (cleanPath) return redirectTo(request, cleanPath);

    if (SHARED_PAGES[pathname]) {
        if (!role) return redirectToLogin(request);
        const target = SHARED_PAGES[pathname][role];
        if (target) return rewriteTo(request, target);
        return rewriteTo(request, '/login');
    }

    if (STUDENT_PAGES[pathname]) {
        if (!role) return redirectToLogin(request);
        if (role !== ROLES.STUDENT) {
            return redirectTo(request, ROLE_DASHBOARDS[role as keyof typeof ROLE_DASHBOARDS] ?? '/dashboard');
        }
        return rewriteTo(request, STUDENT_PAGES[pathname]);
    }

    if (TEACHER_PAGES[pathname]) {
        if (!role) return redirectToLogin(request);
        if (!isTeacher(role)) {
            return redirectTo(request, ROLE_DASHBOARDS[role as keyof typeof ROLE_DASHBOARDS] ?? '/dashboard');
        }
        return rewriteTo(request, TEACHER_PAGES[pathname]);
    }

    if (pathname.startsWith('/student') || pathname.startsWith('/teacher')) {
        const referer = request.headers.get('referer') ?? '';
        const isInternalNav = [
            '/dashboard', '/profile', '/exchange', '/market',
            '/schedule', '/journal', '/analytics', '/topics',
        ].some(p => referer.includes(p));
        if (!isInternalNav) {
            const cleanUrl = LEGACY_REDIRECTS[pathname];
            if (cleanUrl) return redirectTo(request, cleanUrl);
        }
    }

    if (pathname.startsWith('/admin')) {
        if (!role) return redirectToLogin(request);
        if (!isAdmin(role)) return redirectTo(request, '/dashboard');
    }

    if (pathname.startsWith('/system-admin')) {
        if (!role) return redirectToLogin(request);
        if (role !== ROLES.SYSTEM_ADMIN) return redirectTo(request, '/dashboard');
    }

    if (pathname.startsWith('/parent')) {
        if (!role) return redirectToLogin(request);
        if (role !== ROLES.PARENT) return redirectTo(request, '/dashboard');
    }

    return NextResponse.next();
}

export const config = {
    // Broad matcher so the platform-host rewrite can catch "/" and "/login".
    // Static assets are excluded; tenant-host paths the legacy logic doesn't
    // handle simply fall through to NextResponse.next().
    matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json).*)'],
};
