import type { components } from '@perum/api-schema/tenant';

export type AdminTeacherDirectory = components['schemas']['AdminTeacherDirectoryOut'];
export type AdminTeacherDirectoryTeacher = components['schemas']['AdminTeacherDirectoryTeacherOut'];

export function teacherDirectoryPath() { return '/admin/teacher-directory'; }
export function teacherDisplayName(teacher: Pick<AdminTeacherDirectoryTeacher, 'id' | 'name'>) { return teacher.name.trim() || `Учитель ${teacher.id}`; }
export function teacherAssignmentLabel(teacher: AdminTeacherDirectoryTeacher) { return teacher.assignments.length === 0 ? 'Назначений нет' : `${teacher.assignments.length} назнач.`; }
