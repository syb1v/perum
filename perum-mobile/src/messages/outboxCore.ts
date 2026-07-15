import type { Message, MessageMutation } from './types';

export type MessageOutboxStore = {
  recover: () => Promise<void>;
  getRunnable: (accountId: string, now: number) => Promise<MessageMutation | null>;
  getByAccount: (accountId: string) => Promise<MessageMutation[]>;
  put: (mutation: MessageMutation) => Promise<void>;
  remove: (id: string) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
};

export type SendResult =
  | { type: 'success'; message: Message }
  | { type: 'http'; status: number; message?: string; retryAfterMs?: number }
  | { type: 'transport'; message?: string };

export function createMessageOutboxCore(options: {
  store: MessageOutboxStore;
  send: (mutation: MessageMutation) => Promise<SendResult>;
  onChange?: (accountId: string) => void | Promise<void>;
  onSuccess?: (accountId: string, message: Message) => void | Promise<void>;
  now?: () => number;
  key?: () => string;
  backoff?: (attempt: number) => number;
}) {
  const now = options.now ?? Date.now;
  const key = options.key ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
  const backoff = options.backoff ?? ((attempt: number) => Math.min(300_000, 1000 * 2 ** Math.min(attempt, 8)));
  const running = new Set<string>();

  async function enqueue(accountId: string, conversationId: number, body: string) {
    const createdAt = now();
    const id = key();
    const mutation: MessageMutation = { id, accountId, conversationId, clientMessageId: id, body, state: 'pending', attempts: 0, nextAttemptAt: 0, error: null, createdAt };
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
        let result: SendResult;
        try {
          result = await options.send(mutation);
        } catch (error) {
          result = { type: 'transport', message: error instanceof Error ? error.message : undefined };
        }
        if (result.type === 'success') {
          await options.store.remove(mutation.id);
          await options.onSuccess?.(accountId, result.message);
          await options.onChange?.(accountId);
        } else if (result.type === 'transport' || result.status === 408 || result.status === 425 || result.status === 429 || result.status >= 500) {
          const attempts = mutation.attempts + 1;
          await options.store.put({ ...mutation, state: 'retry_wait', attempts, nextAttemptAt: now() + (result.type === 'http' && result.retryAfterMs ? result.retryAfterMs : backoff(attempts)), error: result.message ?? null });
          await options.onChange?.(accountId);
          break;
        } else {
          await options.store.put({ ...mutation, state: 'failed_permanent', error: result.message ?? null });
          await options.onChange?.(accountId);
          break;
        }
        mutation = await options.store.getRunnable(accountId, now());
      }
    } finally {
      running.delete(accountId);
    }
  }

  async function retry(accountId: string, id: string) {
    const mutation = (await options.store.getByAccount(accountId)).find((item) => item.id === id);
    if (!mutation || mutation.accountId !== accountId) return;
    await options.store.put({ ...mutation, state: 'pending', nextAttemptAt: 0, error: null });
    await options.onChange?.(accountId);
    await run(accountId);
  }

  return { enqueue, run, retry, recover: options.store.recover, getByAccount: options.store.getByAccount, removeAccount: options.store.removeAccount };
}
