import { ApiClientError } from '@perum/api-client';
import type { Discovery, TenantAccount, TenantCapabilities, TenantCompatibility } from './types';
import type { DescriptorEventReason } from './descriptorLedgerCore';

export const MOBILE_API_VERSION = 1;
export const MOBILE_DESCRIPTOR_SCHEMA_VERSION = 1;
export const DESCRIPTOR_GRACE_MS = 24 * 60 * 60 * 1000;

export type DescriptorReason = 'app_outdated' | 'tenant_release_outdated' | 'feature_unavailable' | 'core_unavailable' | 'grace_expired';
export type InternalDescriptorReason = DescriptorReason | 'malformed' | 'identity_mismatch';

export class DescriptorGateError extends Error {
  constructor(public readonly reason: InternalDescriptorReason, message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DescriptorGateError';
  }
}

export const capabilityNames = [
  'refresh_sessions', 'session_management', 'push_registration', 'push_delivery',
  'social_friends', 'social_messages', 'social_realtime', 'social_attachments',
  'support_requester', 'support_admin', 'support_attachments', 'offline_preferences',
  'student_academics', 'parent_academics', 'parent_analytics', 'teacher_diary', 'teacher_homeroom', 'teacher_works', 'teacher_analytics', 'offline_homework_state', 'offline_social_messages', 'offline_support_messages',
  'offline_read_cursors', 'offline_social_read_cursors', 'offline_support_ticket_creation',
] as const satisfies readonly (keyof TenantCapabilities)[];

type DiscoveryDependencies = {
  discoverById: (schoolId: string) => Promise<Discovery>;
  discoverByHost: (host: string) => Promise<Discovery>;
  appVersion: string;
  force?: boolean;
  now?: () => number;
  recordEvent?: (reason: DescriptorEventReason) => Promise<void>;
};

export type DescriptorResolution = {
  account: TenantAccount;
  source: 'cached' | 'rediscovered' | 'offline-fallback';
  degradedReason?: 'core_unavailable';
};

export function compareSemVer(left: string, right: string) {
  const parse = (value: string) => {
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
    if (!match) throw new DescriptorGateError('malformed', 'Некорректная SemVer-версия в tenant descriptor');
    const pre = match[4]?.split('.');
    if (pre?.some((item) => /^\d+$/.test(item) && item.length > 1 && item.startsWith('0'))) throw new DescriptorGateError('malformed', 'Некорректная SemVer-версия в tenant descriptor');
    return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre };
  };
  const a = parse(left); const b = parse(right);
  for (let index = 0; index < 3; index += 1) if (a.core[index] !== b.core[index]) return a.core[index]! < b.core[index]! ? -1 : 1;
  if (!a.pre && !b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    const av = a.pre[index]; const bv = b.pre[index];
    if (av === undefined) return -1; if (bv === undefined) return 1; if (av === bv) continue;
    const an = /^\d+$/.test(av); const bn = /^\d+$/.test(bv);
    if (an && bn) return Number(av) < Number(bv) ? -1 : 1;
    if (an !== bn) return an ? -1 : 1;
    return av < bv ? -1 : 1;
  }
  return 0;
}

export function assertDiscoveryCompatibility(compatibility: TenantCompatibility, appVersion: string) {
  if (!compatibility || typeof compatibility !== 'object') throw new DescriptorGateError('malformed', 'Core вернул некорректную compatibility');
  const current = compatibility.mobile_api_version;
  const minimum = compatibility.minimum_mobile_api_version;
  if (!Number.isInteger(current) || !Number.isInteger(minimum) || current < 1 || minimum < 1 || minimum > current) {
    throw new DescriptorGateError('malformed', 'Core вернул некорректный диапазон совместимости mobile API');
  }
  if (MOBILE_API_VERSION < minimum) {
    throw new DescriptorGateError('app_outdated', 'Версия приложения устарела. Обновите приложение для продолжения работы');
  }
  if (MOBILE_API_VERSION > current) {
    throw new DescriptorGateError('tenant_release_outdated', 'Сервер школы ещё не поддерживает эту версию приложения');
  }
  if (compareSemVer(appVersion, compatibility.minimum_app_version) < 0) throw new DescriptorGateError('app_outdated', 'Версия приложения устарела. Обновите приложение для продолжения работы');
}

export function assertCapabilities(value: unknown): asserts value is TenantCapabilities {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DescriptorGateError('malformed', 'Core вернул некорректные capabilities');
  const keys = Object.keys(value).sort();
  const expected = [...capabilityNames].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) || expected.some((key) => typeof (value as Record<string, unknown>)[key] !== 'boolean')) {
    throw new DescriptorGateError('malformed', 'Core вернул некорректные capabilities');
  }
}

export function isDescriptorComplete(account: TenantAccount) {
  try {
    assertCapabilities(account.descriptorCapabilities);
    if (account.descriptorSchemaVersion !== MOBILE_DESCRIPTOR_SCHEMA_VERSION || !account.tenantId || !account.schoolId || !account.tenantHost || !account.apiBaseUrl || !account.descriptorRevision || !account.descriptorExpiresAt || !account.descriptorLastVerifiedAt || !account.descriptorCompatibility) return false;
    const apiUrl = new URL(account.apiBaseUrl);
    if (apiUrl.protocol !== 'https:' && apiUrl.hostname !== 'localhost') return false;
    const expiresAt = Date.parse(account.descriptorExpiresAt);
    const verifiedAt = Date.parse(account.descriptorLastVerifiedAt);
    return Number.isFinite(expiresAt) && Number.isFinite(verifiedAt) && expiresAt >= verifiedAt;
  } catch { return false; }
}

export function isDescriptorFresh(account: TenantAccount, now = Date.now()) {
  if (!isDescriptorComplete(account)) return false;
  const expiresAt = account.descriptorExpiresAt ? Date.parse(account.descriptorExpiresAt) : Number.NaN;
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function assertDiscoveryDescriptor(discovery: Discovery, appVersion: string) {
  if (!discovery || typeof discovery !== 'object' || !discovery.tenant_id || !discovery.school_id || !discovery.school_name || !discovery.canonical_host || !discovery.api_base_url) throw new DescriptorGateError('malformed', 'Core вернул неполный tenant descriptor');
  try {
    const apiUrl = new URL(discovery.api_base_url);
    if (apiUrl.protocol !== 'https:' && apiUrl.hostname !== 'localhost') throw new Error('insecure');
  } catch { throw new DescriptorGateError('malformed', 'Core вернул некорректный tenant route'); }
  if (discovery.schema_version !== MOBILE_DESCRIPTOR_SCHEMA_VERSION) throw new DescriptorGateError('malformed', 'Core вернул неподдерживаемую schema tenant descriptor');
  assertDiscoveryCompatibility(discovery.compatibility, appVersion);
  assertCapabilities(discovery.capabilities);
  if (!discovery.descriptor_revision || !Number.isFinite(discovery.cache_ttl_seconds) || discovery.cache_ttl_seconds <= 0) throw new DescriptorGateError('malformed', 'Core вернул некорректный tenant descriptor');
}

export function applyDiscovery(account: TenantAccount, discovery: Discovery, appVersion: string, now = Date.now()): TenantAccount {
  if (discovery.tenant_id !== account.tenantId || (account.schoolId && discovery.school_id !== account.schoolId)) {
    throw new DescriptorGateError('identity_mismatch', 'Tenant identity changed during discovery');
  }
  assertDiscoveryDescriptor(discovery, appVersion);
  return {
    ...account,
    schoolId: discovery.school_id,
    tenantName: discovery.school_name,
    tenantHost: discovery.canonical_host,
    apiBaseUrl: discovery.api_base_url,
    descriptorRevision: discovery.descriptor_revision,
    descriptorExpiresAt: new Date(now + discovery.cache_ttl_seconds * 1000).toISOString(),
    descriptorLastVerifiedAt: new Date(now).toISOString(),
    descriptorSchemaVersion: discovery.schema_version,
    descriptorCompatibility: discovery.compatibility,
    descriptorCapabilities: discovery.capabilities,
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
  let recorded = false;
  const record = async (reason: DescriptorEventReason) => {
    if (recorded) return;
    recorded = true;
    try { await dependencies.recordEvent?.(reason); } catch {}
  };
  try {
    if (!dependencies.force && isDescriptorFresh(account, now)) {
      assertDiscoveryCompatibility(account.descriptorCompatibility!, dependencies.appVersion);
      return { account, source: 'cached' };
    }
    const discovery = account.schoolId
      ? await dependencies.discoverById(account.schoolId)
      : await dependencies.discoverByHost(account.tenantHost);
    return { account: applyDiscovery(account, discovery, dependencies.appVersion, now), source: 'rediscovered' };
  } catch (error) {
    if (isDiscoveryUnavailable(error)) {
      if (!isDescriptorComplete(account)) throw new DescriptorGateError('core_unavailable', 'Core временно недоступен', error);
      try {
        assertDiscoveryCompatibility(account.descriptorCompatibility!, dependencies.appVersion);
      } catch (compatibilityError) {
        if (compatibilityError instanceof DescriptorGateError && (compatibilityError.reason === 'app_outdated' || compatibilityError.reason === 'tenant_release_outdated')) await record(compatibilityError.reason);
        throw compatibilityError;
      }
      const expiresAt = Date.parse(account.descriptorExpiresAt!);
      if (now <= expiresAt + DESCRIPTOR_GRACE_MS) {
        await record('grace_fallback');
        return { account, source: 'offline-fallback', degradedReason: 'core_unavailable' };
      }
      await record('grace_expired');
      throw new DescriptorGateError('grace_expired', 'Срок автономной работы истёк. Подключитесь к сети', error);
    }
    if (error instanceof ApiClientError) throw new DescriptorGateError('feature_unavailable', error.message, error);
    if (error instanceof DescriptorGateError && ['app_outdated', 'tenant_release_outdated', 'malformed', 'identity_mismatch'].includes(error.reason)) {
      await record(error.reason as DescriptorEventReason);
    }
    throw error;
  }
}
