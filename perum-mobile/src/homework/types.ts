export type HomeworkStatus = 'not_started' | 'in_progress' | 'completed';
export type HomeworkState = { status: HomeworkStatus; version: number; completed_at: string | null };
export type Homework = { id: number; title: string; description?: string | null; subject_name?: string | null; deadline_at?: string | null; due_date?: string | null; is_overdue?: boolean; student_state: HomeworkState };
export type HomeworkMutation = { id: string; accountId: string; homeworkId: number; clientActionId: string; version: number; status: HomeworkStatus; state: 'pending' | 'sending' | 'retry_wait' | 'conflict' | 'failed_permanent'; attempts: number; nextAttemptAt: number; error: string | null; serverState: HomeworkState | null; createdAt: number };
