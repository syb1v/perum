import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClientError } from '@perum/api-client';
import {
  MOBILE_API_VERSION,
  applyDiscovery,
  assertDiscoveryCompatibility,
  isDescriptorFresh,
  resolveAccountDescriptor,
} from './descriptorCore';
import type { Discovery, TenantAccount } from './types';

const now = Date.parse('2026-07-17T12:00:00.000Z');

function discovery(overrides: Partial<Discovery> = {}): Discovery {
  return {
    tenant_id: 'tenant-1',
    organization_id: 'organization-1',
    school_id: 'school-1',
    organization_name: 'Organization',
    school_name: 'School',
    canonical_host: 'new.example.test',
    primary_host: 'new.example.test',
    matched_host: 'old.example.test',
    api_base_url: 'https://new.example.test/api',
    web_base_url: 'https://new.example.test',
    descriptor_revision: 'revision-2',
    cache_ttl_seconds: 3600,
    compatibility: { mobile_api_version: MOBILE_API_VERSION, minimum_mobile_api_version: MOBILE_API_VERSION },
    capabilities: { native_mobile: true },
    ...overrides,
  };
}

function account(overrides: Partial<TenantAccount> = {}): TenantAccount {
  return {
    id: 'tenant-1:user-1',
    tenantId: 'tenant-1',
    schoolId: 'school-1',
    tenantName: 'School',
    tenantHost: 'old.example.test',
    apiBaseUrl: 'https://old.example.test/api',
    descriptorRevision: 'revision-1',
    descriptorExpiresAt: new Date(now + 60_000).toISOString(),
    descriptorCompatibility: { mobile_api_version: 1, minimum_mobile_api_version: 1 },
    user: { id: 'user-1', login: 'student', role: 'student', full_name: 'Student' },
    refreshToken: 'refresh-1',
    ...overrides,
  } as TenantAccount;
}

test('fresh compatible descriptor does not call Core', async () => {
  let calls = 0;
  const saved = account();
  const result = await resolveAccountDescriptor(saved, {
    discoverById: async () => { calls += 1; return discovery(); },
    discoverByHost: async () => { calls += 1; return discovery(); },
    now: () => now,
  });
  assert.equal(result.source, 'cached');
  assert.equal(result.account, saved);
  assert.equal(calls, 0);
  assert.equal(isDescriptorFresh(saved, now), true);
});

test('expired descriptor uses stable school id and updates route', async () => {
  let requestedId = '';
  const result = await resolveAccountDescriptor(account({ descriptorExpiresAt: new Date(now - 1).toISOString() }), {
    discoverById: async (schoolId) => { requestedId = schoolId; return discovery(); },
    discoverByHost: async () => { throw new Error('host lookup must not run'); },
    now: () => now,
  });
  assert.equal(requestedId, 'school-1');
  assert.equal(result.source, 'rediscovered');
  assert.equal(result.account.apiBaseUrl, 'https://new.example.test/api');
  assert.equal(result.account.descriptorExpiresAt, '2026-07-17T13:00:00.000Z');
});

test('legacy account migrates through host lookup and then uses school id', async () => {
  const legacy = account({ schoolId: undefined, descriptorRevision: undefined, descriptorExpiresAt: undefined, descriptorCompatibility: undefined });
  let hostCalls = 0;
  const first = await resolveAccountDescriptor(legacy, {
    discoverById: async () => { throw new Error('id lookup must not run'); },
    discoverByHost: async (host) => { hostCalls += 1; assert.equal(host, 'old.example.test'); return discovery(); },
    now: () => now,
  });
  assert.equal(first.account.schoolId, 'school-1');
  assert.equal(first.account.descriptorCompatibility?.mobile_api_version, 1);
  const expired = { ...first.account, descriptorExpiresAt: new Date(now - 1).toISOString() };
  let idCalls = 0;
  await resolveAccountDescriptor(expired, {
    discoverById: async (id) => { idCalls += 1; assert.equal(id, 'school-1'); return discovery(); },
    discoverByHost: async () => { throw new Error('host lookup must not run'); },
    now: () => now,
  });
  assert.equal(hostCalls, 1);
  assert.equal(idCalls, 1);
});

test('temporary Core failure preserves the last working endpoint', async () => {
  for (const error of [new TypeError('network unavailable'), new ApiClientError('rate limited', 429), new ApiClientError('unavailable', 503)]) {
    const saved = account({ descriptorExpiresAt: new Date(now - 1).toISOString() });
    const result = await resolveAccountDescriptor(saved, {
      discoverById: async () => { throw error; },
      discoverByHost: async () => { throw error; },
      now: () => now,
    });
    assert.equal(result.source, 'offline-fallback');
    assert.equal(result.account, saved);
  }
});

test('identity, compatibility and definitive discovery failures never use fallback', async () => {
  const expired = account({ descriptorExpiresAt: new Date(now - 1).toISOString() });
  await assert.rejects(() => resolveAccountDescriptor(expired, {
    discoverById: async () => discovery({ tenant_id: 'tenant-2' }),
    discoverByHost: async () => discovery(),
    now: () => now,
  }), /identity changed/);
  await assert.rejects(() => resolveAccountDescriptor(expired, {
    discoverById: async () => discovery({ compatibility: { mobile_api_version: 2, minimum_mobile_api_version: 2 } }),
    discoverByHost: async () => discovery(),
    now: () => now,
  }), /устарела/);
  await assert.rejects(() => resolveAccountDescriptor(expired, {
    discoverById: async () => { throw new ApiClientError('not found', 404); },
    discoverByHost: async () => discovery(),
    now: () => now,
  }), /not found/);
});

test('compatibility validation accepts boundaries and rejects malformed ranges', () => {
  assert.doesNotThrow(() => assertDiscoveryCompatibility({ mobile_api_version: 1, minimum_mobile_api_version: 1 }));
  assert.throws(() => assertDiscoveryCompatibility({ mobile_api_version: 2, minimum_mobile_api_version: 2 }), /устарела/);
  assert.throws(() => assertDiscoveryCompatibility({ mobile_api_version: 0, minimum_mobile_api_version: 0 }), /некорректный/);
  assert.throws(() => assertDiscoveryCompatibility({ mobile_api_version: 1, minimum_mobile_api_version: 2 }), /некорректный/);
});

test('app newer than server and malformed descriptor are rejected', () => {
  assert.throws(() => assertDiscoveryCompatibility({ mobile_api_version: MOBILE_API_VERSION - 1, minimum_mobile_api_version: MOBILE_API_VERSION - 1 }), /Сервер школы/);
  assert.throws(() => applyDiscovery(account(), discovery({ cache_ttl_seconds: 0 }), now), /некорректный tenant descriptor/);
});
