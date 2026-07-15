import * as SecureStore from 'expo-secure-store';
import type { Registry } from './types';

const registryKey = 'perum.tenant.accounts.v1';
const emptyRegistry: Registry = { selectedAccountId: null, accounts: [] };

export async function loadRegistry(): Promise<Registry> {
  const value = await SecureStore.getItemAsync(registryKey);
  if (!value) return emptyRegistry;
  try {
    const parsed = JSON.parse(value) as Registry;
    if (!Array.isArray(parsed.accounts)) return emptyRegistry;
    return parsed;
  } catch {
    return emptyRegistry;
  }
}

export async function saveRegistry(registry: Registry) {
  await SecureStore.setItemAsync(registryKey, JSON.stringify(registry), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}
