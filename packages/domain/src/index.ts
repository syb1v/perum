export const USER_ROLES = ['student', 'teacher', 'parent', 'admin', 'school_admin', 'director', 'org_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SCHOOL_ADMIN_ROLES = ['admin', 'school_admin', 'director'] as const;

export function isTeacher(role: string): boolean {
  return role === 'teacher' || SCHOOL_ADMIN_ROLES.includes(role as (typeof SCHOOL_ADMIN_ROLES)[number]);
}

export function isSchoolAdmin(role: string): boolean {
  return SCHOOL_ADMIN_ROLES.includes(role as (typeof SCHOOL_ADMIN_ROLES)[number]);
}

export function lessonTemplateKey(date: string, lessonNumber: number): string {
  return `${date}:${lessonNumber}`;
}
