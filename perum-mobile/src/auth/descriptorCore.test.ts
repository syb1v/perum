import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClientError } from '@perum/api-client';
import {
  MOBILE_API_VERSION,
  DESCRIPTOR_GRACE_MS,
  DescriptorGateError,
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
    compatibility: { mobile_api_version: MOBILE_API_VERSION, minimum_mobile_api_version: MOBILE_API_VERSION, minimum_app_version: '0.0.0' },
    schema_version: 1,
    capabilities: {
      refresh_sessions: true, session_management: true, push_registration: true, push_delivery: false,
      social_friends: true, social_messages: true, social_realtime: true, social_attachments: false,
      support_requester: true, support_admin: true, support_attachments: false, offline_preferences: true, student_academics: true, student_analytics: true, parent_academics: true, parent_analytics: true, teacher_diary: true, teacher_homeroom: true, teacher_works: true, teacher_analytics: true, offline_homework_state: true,
      offline_social_messages: true, offline_support_messages: true, offline_read_cursors: false, offline_social_read_cursors: false, offline_support_ticket_creation: false,
    },
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
    descriptorLastVerifiedAt: new Date(now - 60_000).toISOString(),
    descriptorSchemaVersion: 1,
    descriptorCompatibility: { mobile_api_version: 1, minimum_mobile_api_version: 1, minimum_app_version: '0.0.0' },
    descriptorCapabilities: discovery().capabilities,
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
    appVersion: '1.0.0',
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
    appVersion: '1.0.0',
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
    appVersion: '1.0.0',
    now: () => now,
  });
  assert.equal(first.account.schoolId, 'school-1');
  assert.equal(first.account.descriptorCompatibility?.mobile_api_version, 1);
  const expired = { ...first.account, descriptorExpiresAt: new Date(now - 1).toISOString() };
  let idCalls = 0;
  await resolveAccountDescriptor(expired, {
    discoverById: async (id) => { idCalls += 1; assert.equal(id, 'school-1'); return discovery(); },
    discoverByHost: async () => { throw new Error('host lookup must not run'); },
    appVersion: '1.0.0',
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
      appVersion: '1.0.0',
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
    appVersion: '1.0.0',
    now: () => now,
  }), /identity changed/);
  await assert.rejects(() => resolveAccountDescriptor(expired, {
    discoverById: async () => discovery({ compatibility: { mobile_api_version: 2, minimum_mobile_api_version: 2, minimum_app_version: '0.0.0' } }),
    discoverByHost: async () => discovery(),
    appVersion: '1.0.0',
    now: () => now,
  }), /устарела/);
  await assert.rejects(() => resolveAccountDescriptor(expired, {
    discoverById: async () => { throw new ApiClientError('not found', 404); },
    discoverByHost: async () => discovery(),
    appVersion: '1.0.0',
    now: () => now,
  }), (error) => error instanceof DescriptorGateError && error.reason === 'feature_unavailable');
});

test('compatibility validation accepts boundaries and rejects malformed ranges', () => {
  assert.doesNotThrow(() => assertDiscoveryCompatibility({ mobile_api_version: 1, minimum_mobile_api_version: 1, minimum_app_version: '1.0.0' }, '1.0.0'));
  assert.throws(() => assertDiscoveryCompatibility({ mobile_api_version: 2, minimum_mobile_api_version: 2, minimum_app_version: '1.0.0' }, '1.0.0'), /устарела/);
  assert.throws(() => assertDiscoveryCompatibility({ mobile_api_version: 0, minimum_mobile_api_version: 0, minimum_app_version: '1.0.0' }, '1.0.0'), /некорректный/);
  assert.throws(() => assertDiscoveryCompatibility({ mobile_api_version: 1, minimum_mobile_api_version: 2, minimum_app_version: '1.0.0' }, '1.0.0'), /некорректный/);
});

test('app newer than server and malformed descriptor are rejected', () => {
  assert.throws(() => assertDiscoveryCompatibility({ mobile_api_version: 0, minimum_mobile_api_version: 0, minimum_app_version: '0.0.0' }, '1.0.0'), /некорректный/);
  assert.throws(() => applyDiscovery(account(), discovery({ cache_ttl_seconds: 0 }), '1.0.0', now), /некорректный tenant descriptor/);
});

test('strict SemVer minimum app version is enforced', () => {
  assert.doesNotThrow(() => assertDiscoveryCompatibility(discovery().compatibility, '1.2.3'));
  assert.throws(() => assertDiscoveryCompatibility({ ...discovery().compatibility, minimum_app_version: '1.2.4' }, '1.2.3'), (error) => error instanceof DescriptorGateError && error.reason === 'app_outdated');
  assert.throws(() => assertDiscoveryCompatibility({ ...discovery().compatibility, minimum_app_version: '1.2' }, '1.2.3'), (error) => error instanceof DescriptorGateError && error.reason === 'malformed');
  assert.throws(() => assertDiscoveryCompatibility({ ...discovery().compatibility, minimum_app_version: '1.2.3-01' }, '1.2.3'), (error) => error instanceof DescriptorGateError && error.reason === 'malformed');
});

test('fallback includes the grace boundary and blocks immediately after it', async () => {
  const expiresAt = now - DESCRIPTOR_GRACE_MS;
  for (const offset of [0, 1]) {
    const promise = resolveAccountDescriptor(account({ descriptorExpiresAt: new Date(expiresAt).toISOString(), descriptorLastVerifiedAt: new Date(expiresAt - 60_000).toISOString() }), {
      discoverById: async () => { throw new TypeError('offline'); }, discoverByHost: async () => { throw new TypeError('offline'); }, appVersion: '1.0.0', now: () => now + offset,
    });
    if (offset === 0) assert.equal((await promise).source, 'offline-fallback');
    else await assert.rejects(promise, (error) => error instanceof DescriptorGateError && error.reason === 'grace_expired');
  }
});

test('each descriptor resolution records one bounded outcome and ledger failure is non-blocking', async () => {
  const events: string[] = [];
  const expired = account({ descriptorExpiresAt: new Date(now - 1).toISOString() });
  const fallback = await resolveAccountDescriptor(expired, {
    discoverById: async () => { throw new TypeError('offline'); }, discoverByHost: async () => { throw new Error('unexpected'); },
    appVersion: '1.0.0', now: () => now, recordEvent: async (reason) => { events.push(reason); },
  });
  assert.equal(fallback.source, 'offline-fallback');
  assert.deepEqual(events, ['grace_fallback']);
  await assert.rejects(resolveAccountDescriptor(expired, {
    discoverById: async () => discovery({ compatibility: { mobile_api_version: 1, minimum_mobile_api_version: 1, minimum_app_version: '2.0.0' } }),
    discoverByHost: async () => { throw new Error('unexpected'); }, appVersion: '1.0.0', now: () => now,
    recordEvent: async (reason) => { events.push(reason); throw new Error('storage failed'); },
  }), (error) => error instanceof DescriptorGateError && error.reason === 'app_outdated');
  assert.deepEqual(events, ['grace_fallback', 'app_outdated']);
});

test('incomplete legacy descriptor is stale and never fallback eligible', async () => {
  const legacy = account({ descriptorCapabilities: undefined });
  assert.equal(isDescriptorFresh(legacy, now), false);
  await assert.rejects(resolveAccountDescriptor(legacy, { discoverById: async () => { throw new TypeError('offline'); }, discoverByHost: async () => { throw new TypeError('offline'); }, appVersion: '1.0.0', now: () => now }), (error) => error instanceof DescriptorGateError && error.reason === 'core_unavailable');
});

test('malformed cached routing and timestamps are never fallback eligible', async () => {
  for (const cached of [
    account({ apiBaseUrl: 'http://school.example.test/api', descriptorExpiresAt: new Date(now - 1).toISOString() }),
    account({ descriptorExpiresAt: 'invalid' }),
    account({ descriptorExpiresAt: new Date(now - 1).toISOString(), descriptorLastVerifiedAt: new Date(now + 1).toISOString() }),
  ]) {
    assert.equal(isDescriptorFresh(cached, now), false);
    await assert.rejects(resolveAccountDescriptor(cached, {
      discoverById: async () => { throw new TypeError('offline'); },
      discoverByHost: async () => { throw new TypeError('offline'); },
      appVersion: '1.0.0',
      now: () => now,
    }), (error) => error instanceof DescriptorGateError && error.reason === 'core_unavailable');
  }
});

test('schema, malformed capabilities and minimum app incompatibility never fallback', async () => {
  const expired = account({ descriptorExpiresAt: new Date(now - 1).toISOString() });
  for (const value of [
    discovery({ schema_version: 2 as 1 }),
    discovery({ capabilities: { ...discovery().capabilities, unknown: true } as Discovery['capabilities'] }),
    discovery({ compatibility: { ...discovery().compatibility, minimum_app_version: '2.0.0' } }),
  ]) await assert.rejects(resolveAccountDescriptor(expired, { discoverById: async () => value, discoverByHost: async () => value, appVersion: '1.0.0', now: () => now }));
});
