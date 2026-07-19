import * as SecureStore from 'expo-secure-store';
import { appendDescriptorEvent, readDescriptorEvents, type DescriptorEventReason } from './descriptorLedgerCore';

const key = 'perum.descriptor.events.v1';
const storage = {
  get: () => SecureStore.getItemAsync(key),
  set: (value: string) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
};
let queue = Promise.resolve();

export async function recordDescriptorEvent(reason: DescriptorEventReason) {
  const write = queue.then(() => appendDescriptorEvent(storage, reason));
  queue = write.then(() => undefined, () => undefined);
  await write;
}

export async function exportDescriptorEvents() {
  await queue;
  return readDescriptorEvents(storage);
}
