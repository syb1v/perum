import type { HomeworkMutation, HomeworkState, HomeworkStatus } from './types';

export type HomeworkStore = { recover(): Promise<void>; getRunnable(accountId: string, now: number): Promise<HomeworkMutation | null>; getByAccount(accountId: string): Promise<HomeworkMutation[]>; put(item: HomeworkMutation): Promise<void>; remove(id: string): Promise<void>; removeAccount(accountId: string): Promise<void> };
export type HomeworkResult = { type: 'success'; state: HomeworkState } | { type: 'http'; status: number; message?: string; serverState?: HomeworkState } | { type: 'transport'; message?: string };

export function createHomeworkOutbox(options: { store: HomeworkStore; send(item: HomeworkMutation): Promise<HomeworkResult>; onChange?(accountId: string): void | Promise<void>; onSuccess?(accountId: string, homeworkId: number, state: HomeworkState): void | Promise<void>; now?: () => number; key?: () => string; canSend?: () => boolean }) {
  const now = options.now ?? Date.now;
  const key = options.key ?? (() => crypto.randomUUID());
  const running = new Set<string>();
  async function enqueue(accountId: string, homeworkId: number, version: number, status: HomeworkStatus) {
    const id = key();
    const item: HomeworkMutation = { id, accountId, homeworkId, clientActionId: id, version, status, state: 'pending', attempts: 0, nextAttemptAt: 0, error: null, serverState: null, createdAt: now() };
    await options.store.put(item); await options.onChange?.(accountId); return item;
  }
  async function run(accountId: string) {
    if (running.has(accountId) || options.canSend?.() === false) return; running.add(accountId);
    try {
      let item = options.canSend?.() === false ? null : await options.store.getRunnable(accountId, now());
      while (item) {
        if (options.canSend?.() === false) break;
        const original = item;
        await options.store.put({ ...item, state: 'sending' });
        if (options.canSend?.() === false) { await options.store.put(original); break; }
        let result: HomeworkResult;
        try { result = await options.send(item); } catch (error) { result = { type: 'transport', message: error instanceof Error ? error.message : undefined }; }
        if (result.type === 'success') { await options.store.remove(item.id); await options.onSuccess?.(accountId, item.homeworkId, result.state); }
        else if (result.type === 'transport' || result.status >= 500 || [408, 425, 429].includes(result.status)) { const attempts = item.attempts + 1; await options.store.put({ ...item, state: 'retry_wait', attempts, nextAttemptAt: now() + Math.min(300_000, 1000 * 2 ** Math.min(attempts, 8)), error: result.message ?? null }); }
        else if (result.status === 409 && result.serverState) await options.store.put({ ...item, state: 'conflict', error: result.message ?? null, serverState: result.serverState });
        else await options.store.put({ ...item, state: 'failed_permanent', error: result.message ?? null });
        await options.onChange?.(accountId); item = options.canSend?.() === false ? null : await options.store.getRunnable(accountId, now());
      }
    } finally { running.delete(accountId); }
  }
  async function resolve(accountId: string, id: string, choice: 'server' | 'local') {
    const item = (await options.store.getByAccount(accountId)).find(value => value.id === id);
    if (!item?.serverState) return;
    await options.store.remove(id);
    if (choice === 'server') await options.onSuccess?.(accountId, item.homeworkId, item.serverState);
    else await enqueue(accountId, item.homeworkId, item.serverState.version, item.status);
    await options.onChange?.(accountId);
    if (choice === 'local') await run(accountId);
  }
  return { enqueue, run, resolve, recover: options.store.recover, getByAccount: options.store.getByAccount, removeAccount: options.store.removeAccount };
}
