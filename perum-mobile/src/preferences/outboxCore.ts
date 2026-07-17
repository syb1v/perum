import type { PreferencesMutation, PreferencesSnapshot } from './types';

export type OutboxStore = {
  recover: () => Promise<void>;
  getRunnable: (accountId: string, now: number) => Promise<PreferencesMutation | null>;
  getUnsent: (accountId: string) => Promise<PreferencesMutation | null>;
  getLatest: (accountId: string) => Promise<PreferencesMutation | null>;
  put: (mutation: PreferencesMutation) => Promise<void>;
  remove: (id: string) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
};

export type PatchResult =
  | { type: 'success'; snapshot: PreferencesSnapshot }
  | { type: 'http'; status: number; code?: string; message?: string; current?: PreferencesSnapshot; retryAfterMs?: number }
  | { type: 'transport'; message?: string };

export type OutboxCoreOptions = {
  store: OutboxStore;
  patch: (mutation: PreferencesMutation) => Promise<PatchResult>;
  onSuccess?: (accountId: string, snapshot: PreferencesSnapshot) => void | Promise<void>;
  now?: () => number;
  key?: () => string;
  backoff?: (attempt: number) => number;
  canSend?: () => boolean;
};

const retryStatuses = new Set([408, 425, 429]);

export function createOutboxCore(options: OutboxCoreOptions) {
  const now = options.now ?? Date.now;
  const key = options.key ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const backoff = options.backoff ?? ((attempt) => Math.min(300_000, 1000 * 2 ** Math.min(attempt, 8)));
  const running = new Set<string>();

  async function enqueue(accountId: string, desired: boolean, baseEtag: string) {
    const existing = await options.store.getUnsent(accountId);
    if (existing) {
      const next = { ...existing, desired, state: 'pending' as const, nextAttemptAt: 0, error: null };
      await options.store.put(next);
      return next;
    }
    const createdAt = now();
    const mutation: PreferencesMutation = {
      id: key(), accountId, kind: 'preferences', desired, baseEtag, idempotencyKey: key(), state: 'pending', attempts: 0,
      nextAttemptAt: 0, conflictCurrent: null, error: null, createdAt,
    };
    await options.store.put(mutation);
    return mutation;
  }

  async function run(accountId: string) {
    if (running.has(accountId) || options.canSend?.() === false) return;
    running.add(accountId);
    try {
      let mutation = options.canSend?.() === false ? null : await options.store.getRunnable(accountId, now());
      while (mutation) {
        if (options.canSend?.() === false) break;
        const original = mutation;
        mutation = { ...original, state: 'sending' };
        await options.store.put(mutation);
        if (options.canSend?.() === false) { await options.store.put(original); break; }
        let result: PatchResult;
        try {
          result = await options.patch(mutation);
        } catch (error) {
          result = { type: 'transport', message: error instanceof Error ? error.message : undefined };
        }
        if (result.type === 'success') {
          await options.store.remove(mutation.id);
          await options.onSuccess?.(accountId, result.snapshot);
        } else if (result.type === 'transport' || retryStatuses.has(result.status) || result.status >= 500 || result.code === 'IDEMPOTENCY_IN_PROGRESS') {
          const attempts = mutation.attempts + 1;
          await options.store.put({ ...mutation, state: 'retry_wait', attempts, nextAttemptAt: now() + (result.type === 'http' && result.retryAfterMs ? result.retryAfterMs : backoff(attempts)), error: result.message ?? null });
          break;
        } else if (result.status === 412 && result.current) {
          await options.store.put({ ...mutation, state: 'conflict', conflictCurrent: result.current, error: result.message ?? null });
          break;
        } else if (result.status === 401) {
          await options.store.put({ ...mutation, state: 'blocked_auth', error: result.message ?? null });
          break;
        } else {
          await options.store.put({ ...mutation, state: 'failed_permanent', error: result.message ?? null });
          break;
        }
        mutation = options.canSend?.() === false ? null : await options.store.getRunnable(accountId, now());
      }
    } finally {
      running.delete(accountId);
    }
  }

  async function resolveConflict(accountId: string, choice: 'server' | 'local') {
    const mutation = await options.store.getLatest(accountId);
    if (!mutation || mutation.state !== 'conflict' || !mutation.conflictCurrent) return;
    if (choice === 'server') {
      await options.store.remove(mutation.id);
      await options.onSuccess?.(accountId, mutation.conflictCurrent);
      return;
    }
    await options.store.remove(mutation.id);
    await options.store.put({ ...mutation, id: key(), idempotencyKey: key(), baseEtag: mutation.conflictCurrent.etag, state: 'pending', attempts: 0, nextAttemptAt: 0, conflictCurrent: null, error: null, createdAt: now() });
  }

  return { recover: options.store.recover, enqueue, run, resolveConflict, getLatest: options.store.getLatest, removeAccount: options.store.removeAccount };
}
