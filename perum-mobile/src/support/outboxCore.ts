import type { SupportMessage, SupportMutation } from './types';

export type SupportOutboxStore = {
  recover: () => Promise<void>;
  getRunnable: (accountId: string, now: number) => Promise<SupportMutation | null>;
  getByAccount: (accountId: string) => Promise<SupportMutation[]>;
  put: (mutation: SupportMutation) => Promise<void>;
  remove: (id: string) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
};

export type SupportSendResult =
  | { type: 'success'; message: SupportMessage }
  | { type: 'http'; status: number; message?: string; retryAfterMs?: number }
  | { type: 'transport'; message?: string };

const retryableStatuses = new Set([408, 425, 429]);
const permanentStatuses = new Set([400, 403, 404, 409, 422]);

export function createSupportOutboxCore(options: {
  store: SupportOutboxStore;
  send: (mutation: SupportMutation) => Promise<SupportSendResult>;
  onChange?: (accountId: string) => void | Promise<void>;
  onSuccess?: (accountId: string, ticketId: string, message: SupportMessage) => void | Promise<void>;
  now?: () => number;
  key?: () => string;
  backoff?: (attempt: number) => number;
}) {
  const now = options.now ?? Date.now;
  const key = options.key ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
  const backoff = options.backoff ?? ((attempt: number) => Math.min(300_000, 1000 * 2 ** Math.min(attempt, 8)));
  const running = new Set<string>();

  async function enqueue(accountId: string, ticketId: string, body: string) {
    const id = key();
    const mutation: SupportMutation = { id, accountId, ticketId, clientMessageId: id, body, state: 'pending', attempts: 0, nextAttemptAt: 0, error: null, createdAt: now() };
    await options.store.put(mutation);
    await options.onChange?.(accountId);
    return mutation;
  }

  async function run(accountId: string) {
    if (running.has(accountId)) return;
    running.add(accountId);
    try {
      let mutation = await options.store.getRunnable(accountId, now());
      while (mutation) {
        await options.store.put({ ...mutation, state: 'sending' });
        await options.onChange?.(accountId);
        let result: SupportSendResult;
        try {
          result = await options.send(mutation);
        } catch (error) {
          result = { type: 'transport', message: error instanceof Error ? error.message : undefined };
        }
        if (result.type === 'success') {
          await options.store.remove(mutation.id);
          await options.onSuccess?.(accountId, mutation.ticketId, result.message);
        } else if (result.type === 'transport' || retryableStatuses.has(result.status) || result.status >= 500) {
          const attempts = mutation.attempts + 1;
          await options.store.put({ ...mutation, state: 'retry_wait', attempts, nextAttemptAt: now() + (result.type === 'http' && result.retryAfterMs ? result.retryAfterMs : backoff(attempts)), error: result.message ?? null });
        } else if (permanentStatuses.has(result.status) || result.status < 500) {
          await options.store.put({ ...mutation, state: 'failed_permanent', error: result.message ?? null });
        }
        await options.onChange?.(accountId);
        mutation = await options.store.getRunnable(accountId, now());
      }
    } finally {
      running.delete(accountId);
    }
  }

  async function retry(accountId: string, id: string) {
    const mutation = (await options.store.getByAccount(accountId)).find((item) => item.id === id);
    if (!mutation) return;
    await options.store.put({ ...mutation, state: 'pending', nextAttemptAt: 0, error: null });
    await options.onChange?.(accountId);
    await run(accountId);
  }

  return { enqueue, run, retry, recover: options.store.recover, getByAccount: options.store.getByAccount, removeAccount: options.store.removeAccount };
}
