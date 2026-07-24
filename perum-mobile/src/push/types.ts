import type { components } from '@perum/api-schema/tenant';

export type PushRegistrationPut = components['schemas']['RegistrationPut'];
export type PushRegistration = components['schemas']['PushRegistrationOut'];
export type PushRegistrationStatus = components['schemas']['PushRegistrationStatusOut'];

export function hasActivePushRegistration(status: PushRegistrationStatus) {
  return status.registration !== null;
}

export type PushTap = { id: string; url: string };

export function parsePushTap(value: unknown, id: unknown): PushTap | null {
  if (!value || typeof value !== 'object' || typeof id !== 'string' || !id) return null;
  const url = (value as Record<string, unknown>).url;
  if (typeof url !== 'string' || url.length > 2048) return null;
  return { id, url };
}
