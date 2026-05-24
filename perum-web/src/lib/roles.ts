/**
 * Единый источник правды по ролям пользователей.
 *
 * Используется в middleware.ts, AuthContext, layout-файлах каждой роли.
 * Бэкенд определяет тот же набор в app/enums.py — значения должны совпадать.
 */

export const ROLES = {
    SYSTEM_ADMIN: 'system_admin',
    ORG_ADMIN: 'org_admin',
    ADMIN: 'admin',
    SCHOOL_ADMIN: 'school_admin',
    DIRECTOR: 'director',
    TEACHER: 'teacher',
    CLASS_TEACHER: 'class_teacher',
    HOMEROOM_TEACHER: 'homeroom_teacher',
    STUDENT: 'student',
    PARENT: 'parent',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ADMIN_ROLES: readonly Role[] = [
    ROLES.ORG_ADMIN,
    ROLES.ADMIN,
    ROLES.SCHOOL_ADMIN,
    ROLES.DIRECTOR,
    ROLES.SYSTEM_ADMIN,
];

export const TEACHER_ROLES: readonly Role[] = [
    ROLES.TEACHER,
    ROLES.CLASS_TEACHER,
    ROLES.HOMEROOM_TEACHER,
];

export const STAFF_ROLES: readonly Role[] = [...ADMIN_ROLES, ...TEACHER_ROLES];

/**
 * Куда отправить пользователя после логина / по /dashboard.
 * Возвращает clean-URL, middleware перепишет на внутренний роут.
 */
export const ROLE_DASHBOARDS: Record<Role, string> = {
    [ROLES.SYSTEM_ADMIN]: '/system-admin',
    [ROLES.ORG_ADMIN]: '/admin',
    [ROLES.ADMIN]: '/admin',
    [ROLES.SCHOOL_ADMIN]: '/admin',
    [ROLES.DIRECTOR]: '/admin',
    [ROLES.TEACHER]: '/dashboard',
    [ROLES.CLASS_TEACHER]: '/dashboard',
    [ROLES.HOMEROOM_TEACHER]: '/dashboard',
    [ROLES.STUDENT]: '/dashboard',
    [ROLES.PARENT]: '/parent',
};

export function getDashboardPath(role: string | null | undefined): string {
    if (!role) return '/login';
    return ROLE_DASHBOARDS[role as Role] ?? '/dashboard';
}

export function isAdmin(role: string | null | undefined): boolean {
    return role !== null && role !== undefined && (ADMIN_ROLES as readonly string[]).includes(role);
}

export function isTeacher(role: string | null | undefined): boolean {
    return role !== null && role !== undefined && (TEACHER_ROLES as readonly string[]).includes(role);
}

export function isStaff(role: string | null | undefined): boolean {
    return role !== null && role !== undefined && (STAFF_ROLES as readonly string[]).includes(role);
}

/**
 * Может ли роль обращаться к пути верхнего уровня.
 * Используется middleware + layout-ами для редиректа.
 */
export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
    if (!role) return false;

    if (pathname.startsWith('/system-admin')) return role === ROLES.SYSTEM_ADMIN;
    if (pathname.startsWith('/admin')) return isAdmin(role);
    if (pathname.startsWith('/teacher')) return isTeacher(role) || isAdmin(role);
    if (pathname.startsWith('/student')) return role === ROLES.STUDENT;
    if (pathname.startsWith('/parent')) return role === ROLES.PARENT;
    return true;
}
