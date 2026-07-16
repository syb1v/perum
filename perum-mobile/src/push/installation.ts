import * as SecureStore from 'expo-secure-store';

const idKey = 'perum.push.installation.v1';
const secretKey = 'perum.push.installation.secret.v1';

export async function getInstallation() {
  let id = await SecureStore.getItemAsync(idKey);
  let secret = await SecureStore.getItemAsync(secretKey);
  if (!id) {
    id = crypto.randomUUID();
    await SecureStore.setItemAsync(idKey, id);
  }
  if (!secret) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    secret = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    await SecureStore.setItemAsync(secretKey, secret);
  }
  return { id, secret };
}
