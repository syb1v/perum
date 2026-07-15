export type PersistenceAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

type CacheEnvelope<T> = {
  version: number;
  namespace: string;
  savedAt: number;
  value: T;
};

export function createPersistenceCore(adapter: PersistenceAdapter, options: { version: number; maxAge: number; now?: () => number }) {
  const now = options.now ?? Date.now;
  const key = (namespace: string) => `perum:read-cache:${namespace}`;

  return {
    async restore<T>(namespace: string): Promise<T | null> {
      try {
        const raw = await adapter.getItem(key(namespace));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CacheEnvelope<T>;
        if (parsed.version !== options.version || parsed.namespace !== namespace || !Number.isFinite(parsed.savedAt) || now() - parsed.savedAt > options.maxAge || parsed.savedAt > now()) {
          await adapter.removeItem(key(namespace)).catch(() => undefined);
          return null;
        }
        return parsed.value ?? null;
      } catch {
        await adapter.removeItem(key(namespace)).catch(() => undefined);
        return null;
      }
    },
    async persist<T>(namespace: string, value: T): Promise<void> {
      try {
        await adapter.setItem(key(namespace), JSON.stringify({ version: options.version, namespace, savedAt: now(), value } satisfies CacheEnvelope<T>));
      } catch {
      }
    },
    async remove(namespace: string): Promise<void> {
      try {
        await adapter.removeItem(key(namespace));
      } catch {
      }
    },
  };
}
