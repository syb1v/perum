import type { AdminTicketAction } from './adminCore';
import type { SupportTicket } from './types';

export type AdminActionMutation = { id: string; accountId: string; ticketId: string; action: AdminTicketAction; expectedVersion: number; state: 'pending' | 'sending' | 'retry_wait' | 'conflict' | 'failed_permanent'; attempts: number; nextAttemptAt: number; error: string | null; createdAt: number };
export type AdminActionStore = { recover(): Promise<void>; getRunnable(accountId: string, now: number): Promise<AdminActionMutation | null>; getByAccount(accountId: string): Promise<AdminActionMutation[]>; put(item: AdminActionMutation): Promise<void>; remove(id: string): Promise<void>; removeAccount(accountId: string): Promise<void> };
export type AdminActionResult = { type: 'success'; ticket: SupportTicket } | { type: 'http'; status: number; code?: string; message?: string } | { type: 'transport'; message?: string };

export function createAdminActionOutbox(options: { store: AdminActionStore; send(item: AdminActionMutation): Promise<AdminActionResult>; onChange?(accountId: string): void | Promise<void>; onSuccess?(accountId: string, ticket: SupportTicket): void | Promise<void>; onConflict?(accountId: string, ticketId: string): void | Promise<void>; now?: () => number; key?: () => string; canSend?: () => boolean }) {
  const now = options.now ?? Date.now;
  const key = options.key ?? (() => crypto.randomUUID());
  const running = new Set<string>();
  async function enqueue(accountId: string, ticketId: string, expectedVersion: number, action: AdminTicketAction) {
    if ((await options.store.getByAccount(accountId)).some(item => item.ticketId === ticketId)) return null;
    const item: AdminActionMutation = { id: key(), accountId, ticketId, action, expectedVersion, state: 'pending', attempts: 0, nextAttemptAt: 0, error: null, createdAt: now() };
    await options.store.put(item); await options.onChange?.(accountId); return item;
  }
  async function run(accountId: string) {
    if (running.has(accountId) || options.canSend?.() === false) return; running.add(accountId);
    try {
      let item = await options.store.getRunnable(accountId, now());
      while (item && options.canSend?.() !== false) {
        const original = item; await options.store.put({ ...item, state: 'sending' });
        if (options.canSend?.() === false) { await options.store.put(original); break; }
        let result: AdminActionResult;
        try { result = await options.send(item); } catch (error) { result = { type: 'transport', message: error instanceof Error ? error.message : undefined }; }
        if (result.type === 'success') { await options.store.remove(item.id); await options.onSuccess?.(accountId, result.ticket); }
        else if (result.type === 'transport' || result.status >= 500 || [408, 425, 429].includes(result.status)) { const attempts = item.attempts + 1; await options.store.put({ ...item, state: 'retry_wait', attempts, nextAttemptAt: now() + Math.min(300_000, 1000 * 2 ** Math.min(attempts, 8)), error: result.message ?? null }); }
        else if (result.status === 409 && result.code === 'VERSION_CONFLICT') { await options.store.put({ ...item, state: 'conflict', error: result.message ?? null }); await options.onConflict?.(accountId, item.ticketId); }
        else await options.store.put({ ...item, state: 'failed_permanent', error: result.message ?? null });
        await options.onChange?.(accountId); item = await options.store.getRunnable(accountId, now());
      }
    } finally { running.delete(accountId); }
  }
  async function discard(accountId: string, id: string) { await options.store.remove(id); await options.onChange?.(accountId); }
  return { enqueue, run, discard, recover: options.store.recover, getByAccount: options.store.getByAccount, removeAccount: options.store.removeAccount };
}
