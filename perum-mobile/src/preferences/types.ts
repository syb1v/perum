export type Preferences = {
  push_preview_enabled: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type PreferencesSnapshot = { data: Preferences; etag: string };

export type OutboxState = 'pending' | 'sending' | 'retry_wait' | 'conflict' | 'blocked_auth' | 'failed_permanent';

export type PreferencesMutation = {
  id: string;
  accountId: string;
  kind: 'preferences';
  desired: boolean;
  baseEtag: string;
  idempotencyKey: string;
  state: OutboxState;
  attempts: number;
  nextAttemptAt: number;
  conflictCurrent: PreferencesSnapshot | null;
  error: string | null;
  createdAt: number;
};
