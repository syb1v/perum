import { ApiClientError } from '@perum/api-client';
import type { Discovery, TenantAccount } from './types';

export const MOBILE_API_VERSION = 1;

type DiscoveryDependencies = {
  discoverById: (schoolId: string) => Promise<Discovery>;
  discoverByHost: (host: string) => Promise<Discovery>;
  now?: () => number;
};

export type DescriptorResolution = {
  account: TenantAccount;
  source: 'cached' | 'rediscovered' | 'offline-fallback';
};

export function assertDiscoveryCompatibility(compatibility: Discovery['compatibility']) {
  const current = compatibility.mobile_api_version;
  const minimum = compatibility.minimum_mobile_api_version;
  if (!Number.isInteger(current) || !Number.isInteger(minimum) || current < 1 || minimum < 1 || minimum > current) {
    throw new Error('Core вернул некорректный диапазон совместимости mobile API');
  }
  if (MOBILE_API_VERSION < minimum) {
    throw new Error('Версия приложения устарела. Обновите приложение для продолжения работы');
  }
  if (MOBILE_API_VERSION > current) {
    throw new Error('Сервер школы ещё не поддерживает эту версию приложения');
  }
}

export function isDescriptorFresh(account: TenantAccount, now = Date.now()) {
  if (!account.schoolId || !account.descriptorRevision || !account.descriptorCompatibility) return false;
  const expiresAt = account.descriptorExpiresAt ? Date.parse(account.descriptorExpiresAt) : Number.NaN;
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function applyDiscovery(account: TenantAccount, discovery: Discovery, now = Date.now()): TenantAccount {
  if (discovery.tenant_id !== account.tenantId || (account.schoolId && discovery.school_id !== account.schoolId)) {
    throw new Error('Tenant identity changed during discovery');
  }
  assertDiscoveryCompatibility(discovery.compatibility);
  if (!discovery.descriptor_revision || !Number.isFinite(discovery.cache_ttl_seconds) || discovery.cache_ttl_seconds <= 0) {
    throw new Error('Core вернул некорректный tenant descriptor');
  }
  return {
    ...account,
    schoolId: discovery.school_id,
    tenantName: discovery.school_name,
    tenantHost: discovery.canonical_host,
    apiBaseUrl: discovery.api_base_url,
    descriptorRevision: discovery.descriptor_revision,
    descriptorExpiresAt: new Date(now + discovery.cache_ttl_seconds * 1000).toISOString(),
    descriptorCompatibility: discovery.compatibility,
  };
}

export function isDiscoveryUnavailable(error: unknown) {
  return error instanceof TypeError
    || (error instanceof ApiClientError && (error.status === 429 || error.status >= 500));
}

export async function resolveAccountDescriptor(
  account: TenantAccount,
  dependencies: DiscoveryDependencies,
): Promise<DescriptorResolution> {
  const now = dependencies.now?.() ?? Date.now();
  if (isDescriptorFresh(account, now)) {
    assertDiscoveryCompatibility(account.descriptorCompatibility!);
    return { account, source: 'cached' };
  }
  try {
    const discovery = account.schoolId
      ? await dependencies.discoverById(account.schoolId)
      : await dependencies.discoverByHost(account.tenantHost);
    return { account: applyDiscovery(account, discovery, now), source: 'rediscovered' };
  } catch (error) {
    if (isDiscoveryUnavailable(error) && account.apiBaseUrl) {
      return { account, source: 'offline-fallback' };
    }
    throw error;
  }
}
