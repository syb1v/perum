import type { SupportTicketCreateMutation, SupportTicketCreateOut, SupportCategory } from './types';

export type SupportTicketCreationStore = {
  recover: () => Promise<void>;
  getRunnable: (accountId: string, now: number) => Promise<SupportTicketCreateMutation | null>;
  getByAccount: (accountId: string) => Promise<SupportTicketCreateMutation[]>;
  put: (mutation: SupportTicketCreateMutation) => Promise<void>;
  remove: (accountId: string, id: string) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
};

export type SupportTicketCreateResult =
  | { type: 'success'; result: SupportTicketCreateOut }
  | { type: 'http'; status: number; message?: string; retryAfterMs?: number }
  | { type: 'transport'; message?: string };

const retryableStatuses = new Set([408, 425, 429]);

export function createSupportTicketCreationOutboxCore(options: {
  store: SupportTicketCreationStore;
  send: (mutation: SupportTicketCreateMutation) => Promise<SupportTicketCreateResult>;
  onChange?: (accountId: string) => void | Promise<void>;
  onSuccess?: (accountId: string, localId: string, serverTicketId: string) => void | Promise<void>;
  now?: () => number;
  key?: () => string;
  backoff?: (attempt: number) => number;
  canSend?: () => boolean;
}) {
  const now = options.now ?? Date.now;
  const key = options.key ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
  const backoff = options.backoff ?? ((attempt: number) => Math.min(300_000, 1000 * 2 ** Math.min(attempt, 8)));
  const running = new Set<string>();

  async function enqueue(accountId: string, category: SupportCategory, subject: string, body: string) {
    const id = key();
    const mutation: SupportTicketCreateMutation = { id, accountId, clientTicketId: `ticket-${id}`, clientMessageId: `message-${id}`, category, subject, body, state: 'pending', attempts: 0, nextAttemptAt: 0, error: null, createdAt: now(), serverTicketId: null };
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
        await options.onChange?.(accountId);
        let result: SupportTicketCreateResult;
        try {
          result = await options.send(mutation);
        } catch (error) {
          result = { type: 'transport', message: error instanceof Error ? error.message : undefined };
        }
        if (result.type === 'success') {
          const reconciled: SupportTicketCreateMutation = { ...mutation, state: 'reconciled', error: null, serverTicketId: result.result.ticket.id };
          await options.store.put(reconciled);
          await options.onSuccess?.(accountId, mutation.id, result.result.ticket.id);
        } else if (result.type === 'transport' || retryableStatuses.has(result.status) || result.status >= 500) {
          const attempts = mutation.attempts + 1;
          await options.store.put({ ...mutation, state: 'retry_wait', attempts, nextAttemptAt: now() + (result.type === 'http' && result.retryAfterMs ? result.retryAfterMs : backoff(attempts)), error: result.message ?? null });
        } else {
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
    if (!mutation || mutation.state === 'reconciled') return;
    await options.store.put({ ...mutation, state: 'pending', nextAttemptAt: 0, error: null });
    await options.onChange?.(accountId);
    await run(accountId);
  }

  return { enqueue, run, retry, recover: options.store.recover, getByAccount: options.store.getByAccount, remove: options.store.remove, removeAccount: options.store.removeAccount };
}
