import type { components } from '@perum/api-schema/tenant';

export type AdminClasses = components['schemas']['AdminClassesOut'];
export type AdminClass = components['schemas']['AdminClassOut'];

export function classDirectoryPath() { return '/admin/classes'; }
export function classTeacherLabel(item: AdminClass) { return item.teacher?.name || 'Не назначен'; }
export function classGradeLabel(item: AdminClass) { return item.grade_level === null ? 'Класс без уровня' : `${item.grade_level} класс`; }
export function classProfileLabel(item: AdminClass) { return item.is_profile ? 'Профильный' : null; }
