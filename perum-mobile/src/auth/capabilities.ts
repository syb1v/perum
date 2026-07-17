import type { TenantAccount, TenantCapabilities } from './types';

export function hasCapability(account: TenantAccount | null, capability: keyof TenantCapabilities) {
  return account?.descriptorCapabilities?.[capability] === true;
}

export function hasCapabilities(account: TenantAccount | null, capabilities: readonly (keyof TenantCapabilities)[]) {
  return capabilities.every((capability) => hasCapability(account, capability));
}
