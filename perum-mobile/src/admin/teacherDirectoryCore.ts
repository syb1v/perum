import type { components } from '@perum/api-schema/tenant';

export type AdminTeacherDirectory = components['schemas']['AdminTeacherDirectoryOut'];
export type AdminTeacherDirectoryTeacher = components['schemas']['AdminTeacherDirectoryTeacherOut'];

export function teacherDirectoryPath() { return '/admin/teacher-directory'; }
export function teacherAssignmentLabel(teacher: AdminTeacherDirectoryTeacher) { return teacher.assignments.length === 0 ? 'Назначений нет' : `${teacher.assignments.length} назнач.`; }
