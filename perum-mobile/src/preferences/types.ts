import type { components } from '@perum/api-schema/tenant';

export type Preferences = components['schemas']['PreferencesResponse'];
export type PreferencesPatch = components['schemas']['PreferencesPatch'];

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
