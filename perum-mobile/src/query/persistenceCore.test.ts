import assert from 'node:assert/strict';
import test from 'node:test';
import { createPersistenceCore, type PersistenceAdapter } from './persistenceCore';

function memoryAdapter(): PersistenceAdapter & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: async (key) => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async (key) => { values.delete(key); } };
}

test('round trips values inside the account namespace', async () => {
  const adapter = memoryAdapter();
  const cache = createPersistenceCore(adapter, { version: 1, maxAge: 1000, now: () => 10 });
  await cache.persist('tenant:user', { name: 'Иван' });
  assert.deepEqual(await cache.restore('tenant:user'), { name: 'Иван' });
  assert.equal(await cache.restore('other:user'), null);
});

test('corrupt, expired and wrong-version entries are safe misses', async () => {
  const adapter = memoryAdapter();
  const cache = createPersistenceCore(adapter, { version: 2, maxAge: 100, now: () => 500 });
  adapter.values.set('perum:read-cache:corrupt', '{');
  adapter.values.set('perum:read-cache:expired', JSON.stringify({ version: 2, namespace: 'expired', savedAt: 399, value: 1 }));
  adapter.values.set('perum:read-cache:old', JSON.stringify({ version: 1, namespace: 'old', savedAt: 500, value: 1 }));
  assert.equal(await cache.restore('corrupt'), null);
  assert.equal(await cache.restore('expired'), null);
  assert.equal(await cache.restore('old'), null);
  assert.equal(adapter.values.size, 0);
});

test('adapter failures never escape', async () => {
  const fail: PersistenceAdapter = { getItem: async () => { throw new Error('read'); }, setItem: async () => { throw new Error('write'); }, removeItem: async () => { throw new Error('remove'); } };
  const cache = createPersistenceCore(fail, { version: 1, maxAge: 1 });
  assert.equal(await cache.restore('a'), null);
  await cache.persist('a', 1);
  await cache.remove('a');
});

test('remove invalidates writes queued by a logged-out generation', async () => {
  const adapter = memoryAdapter();
  let release: (() => void) | undefined;
  const original = adapter.setItem;
  adapter.setItem = async (key, value) => { await new Promise<void>((resolve) => { release = resolve; }); await original(key, value); };
  const cache = createPersistenceCore(adapter, { version: 1, maxAge: 1000 });
  const write = cache.persist('account', { private: true });
  await Promise.resolve();
  const remove = cache.remove('account');
  release?.();
  await Promise.all([write, remove]);
  assert.equal(await cache.restore('account'), null);
});
