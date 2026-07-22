import type { components } from '@perum/api-schema/tenant';

export type PushRegistrationPut = components['schemas']['RegistrationPut'];
export type PushRegistration = components['schemas']['PushRegistrationOut'];
export type PushRegistrationStatus = components['schemas']['PushRegistrationStatusOut'];

export function hasActivePushRegistration(status: PushRegistrationStatus) {
  return status.registration !== null;
}
