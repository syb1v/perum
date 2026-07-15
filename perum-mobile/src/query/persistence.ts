import Storage from 'expo-sqlite/kv-store';
import { createPersistenceCore } from './persistenceCore';

export const queryPersistence = createPersistenceCore(Storage, {
  version: 1,
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

const accountDataRemovers = [async (accountId: string) => queryPersistence.remove(accountId)];

export function registerAccountLocalDataRemover(remover: (accountId: string) => Promise<void>) {
  accountDataRemovers.push(remover);
}

export async function removeAccountLocalData(accountId: string) {
  await Promise.allSettled(accountDataRemovers.map((remove) => remove(accountId)));
}
