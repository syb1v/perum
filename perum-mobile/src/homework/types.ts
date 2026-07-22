import type { components } from '@perum/api-schema/tenant';

export type HomeworkStatus = components['schemas']['HomeworkStudentStateOut']['status'];
export type HomeworkState = components['schemas']['HomeworkStudentStateOut'];
export type HomeworkStateResponse = components['schemas']['HomeworkStateOut'];
export type HomeworkList = components['schemas']['HomeworkListOut'];
export type Homework = components['schemas']['HomeworkOut'] & { student_state: HomeworkState };
export type HomeworkMutation = { id: string; accountId: string; homeworkId: number; clientActionId: string; version: number; status: HomeworkStatus; state: 'pending' | 'sending' | 'retry_wait' | 'conflict' | 'failed_permanent'; attempts: number; nextAttemptAt: number; error: string | null; serverState: HomeworkState | null; createdAt: number };

export function studentHomework(list: HomeworkList): Homework[] {
  return list.homework.filter((item): item is Homework => item.student_state !== null);
}
