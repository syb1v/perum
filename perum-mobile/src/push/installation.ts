import * as SecureStore from 'expo-secure-store';

const key = 'perum.push.installation.v1';

export async function getInstallationId() {
  const existing = await SecureStore.getItemAsync(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  await SecureStore.setItemAsync(key, value);
  return value;
}
