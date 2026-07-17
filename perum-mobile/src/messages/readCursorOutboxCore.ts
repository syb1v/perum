import type { SocialReadMutation } from './types';

export type SocialReadOutboxStore = {
  recover: () => Promise<void>;
  getRunnable: (accountId: string, now: number) => Promise<SocialReadMutation | null>;
  getByAccount: (accountId: string) => Promise<SocialReadMutation[]>;
  getByMessage: (accountId: string, conversationId: number, messageId: number) => Promise<SocialReadMutation | null>;
  put: (mutation: SocialReadMutation) => Promise<void>;
  remove: (accountId: string, id: string) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
};

export type SocialReadResult = { type: 'success' } | { type: 'http'; status: number; message?: string; retryAfterMs?: number } | { type: 'transport'; message?: string };

const retryableStatuses = new Set([401, 408, 425, 429]);

export function createSocialReadCursorOutboxCore(options: {
  store: SocialReadOutboxStore;
  send: (mutation: SocialReadMutation) => Promise<SocialReadResult>;
  onChange?: (accountId: string) => void | Promise<void>;
  onSuccess?: (accountId: string, conversationId: number) => void | Promise<void>;
  now?: () => number;
  key?: () => string;
  backoff?: (attempt: number) => number;
  canSend?: () => boolean;
}) {
  const now = options.now ?? Date.now;
  const key = options.key ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
  const backoff = options.backoff ?? ((attempt: number) => Math.min(300_000, 1000 * 2 ** Math.min(attempt, 8)));
  const running = new Set<string>();

  async function enqueue(accountId: string, conversationId: number, messageId: number) {
    const existing = await options.store.getByMessage(accountId, conversationId, messageId);
    if (existing) return existing;
    const id = key();
    const mutation: SocialReadMutation = { id, accountId, conversationId, messageId, clientActionId: id, state: 'pending', attempts: 0, nextAttemptAt: 0, error: null, createdAt: now() };
    await options.store.put(mutation);
    await options.onChange?.(accountId);
    return mutation;
  }

  async function run(accountId: string) {
    if (running.has(accountId) || options.canSend?.() === false) return;
    running.add(accountId);
    try {
      let mutation = await options.store.getRunnable(accountId, now());
      while (mutation && options.canSend?.() !== false) {
        const original = mutation;
        await options.store.put({ ...mutation, state: 'sending' });
        if (options.canSend?.() === false) { await options.store.put(original); break; }
        let result: SocialReadResult;
        try { result = await options.send(mutation); }
        catch (error) { result = { type: 'transport', message: error instanceof Error ? error.message : undefined }; }
        if (result.type === 'success') {
          await options.store.remove(accountId, mutation.id);
          await options.onSuccess?.(accountId, mutation.conversationId);
        } else if (result.type === 'transport' || retryableStatuses.has(result.status) || result.status >= 500) {
          const attempts = mutation.attempts + 1;
          await options.store.put({ ...mutation, state: 'retry_wait', attempts, nextAttemptAt: now() + (result.type === 'http' && result.retryAfterMs ? result.retryAfterMs : backoff(attempts)), error: result.message ?? null });
        } else {
          await options.store.put({ ...mutation, state: 'failed_permanent', error: result.message ?? null });
        }
        await options.onChange?.(accountId);
        mutation = await options.store.getRunnable(accountId, now());
      }
    } finally { running.delete(accountId); }
  }

  return { enqueue, run, recover: options.store.recover, getByAccount: options.store.getByAccount, removeAccount: options.store.removeAccount };
}
