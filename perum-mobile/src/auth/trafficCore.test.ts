import assert from 'node:assert/strict';
import test from 'node:test';
import { createHomeworkOutbox, type HomeworkStore } from '../homework/outboxCore';
import type { HomeworkMutation } from '../homework/types';
import { resolveAccountDescriptor } from './descriptorCore';
import { createDescriptorLifecycleScheduler, createTenantTrafficGate, leaseApiClient, TenantTrafficClosedError } from './trafficCore';
import type { Discovery, TenantAccount } from './types';

const now = Date.parse('2026-07-17T12:00:00.000Z');
const capabilities = {
  refresh_sessions: true, session_management: true, push_registration: true, push_delivery: false,
  social_friends: true, social_messages: true, social_realtime: true, social_attachments: false,
  support_requester: true, support_admin: true, support_attachments: false, offline_preferences: true, student_academics: true, parent_academics: true, teacher_diary: true, teacher_homeroom: true, teacher_works: true, teacher_analytics: true, offline_homework_state: true,
  offline_social_messages: true, offline_support_messages: true, offline_read_cursors: false, offline_social_read_cursors: false, offline_support_ticket_creation: false,
};

function account(id: string, revision: string, route: string, expiresAt = now + 60_000): TenantAccount {
  return {
    id, tenantId: id.split(':')[0]!, schoolId: `school-${id}`, tenantName: id, tenantHost: `${id}.test`, apiBaseUrl: route,
    descriptorRevision: revision, descriptorExpiresAt: new Date(expiresAt).toISOString(), descriptorLastVerifiedAt: new Date(now - 1).toISOString(), descriptorSchemaVersion: 1,
    descriptorCompatibility: { mobile_api_version: 1, minimum_mobile_api_version: 1, minimum_app_version: '0.0.0' }, descriptorCapabilities: { ...capabilities },
    user: { id: id.split(':')[1]!, login: id, role: 'student', full_name: id }, refreshToken: `refresh-${id}`,
  } as unknown as TenantAccount;
}

function discovery(saved: TenantAccount, revision: string, route: string, enabled = true): Discovery {
  return {
    tenant_id: saved.tenantId, organization_id: 'organization', school_id: saved.schoolId!, organization_name: 'Org', school_name: saved.tenantName,
    canonical_host: new URL(route).hostname, primary_host: new URL(route).hostname, matched_host: saved.tenantHost, api_base_url: route, web_base_url: route.replace('/api', ''),
    descriptor_revision: revision, cache_ttl_seconds: 60, schema_version: 1,
    compatibility: { mobile_api_version: 1, minimum_mobile_api_version: 1, minimum_app_version: '0.0.0' }, capabilities: { ...capabilities, offline_homework_state: enabled },
  };
}

test('cold start cached and rediscovered descriptors open traffic only after acceptance persistence', async () => {
  for (const expired of [false, true]) {
    const events: string[] = [];
    const saved = account('tenant-a:user-a', 'r1', 'https://old.test/api', expired ? now - 1 : now + 1);
    const gate = createTenantTrafficGate(() => now);
    const resolved = await resolveAccountDescriptor(saved, {
      discoverById: async () => { events.push('core'); return discovery(saved, 'r2', 'https://new.test/api'); },
      discoverByHost: async () => { throw new Error('unexpected'); }, appVersion: '1.0.0', now: () => now,
    });
    events.push(`resolved:${resolved.source}`);
    events.push('persisted');
    gate.open(resolved.account, false);
    leaseApiClient({ get: async () => { events.push('tenant'); return {}; } } as never, gate.lease(resolved.account)).get('/user/me');
    assert.deepEqual(events, expired ? ['core', 'resolved:rediscovered', 'persisted', 'tenant'] : ['resolved:cached', 'persisted', 'tenant']);
  }
});

test('cold start grace preserves identity while blocked failures never open tenant traffic', async () => {
  const saved = account('tenant-a:user-a', 'r1', 'https://old.test/api', now - 1);
  for (const expiredGrace of [false, true]) {
    const gate = createTenantTrafficGate(() => expiredGrace ? now + 24 * 60 * 60 * 1000 + 2 : now);
    const outboxIdentity = { accountId: saved.id, clientActionId: 'pending-1' };
    try {
      const resolution = await resolveAccountDescriptor(saved, { discoverById: async () => { throw new TypeError('offline'); }, discoverByHost: async () => { throw new TypeError('offline'); }, appVersion: '1.0.0', now: () => expiredGrace ? now + 24 * 60 * 60 * 1000 + 2 : now });
      gate.open(resolution.account, true);
      assert.equal(resolution.degradedReason, 'core_unavailable');
      assert.equal(gate.isOpen(), true);
    } catch {
      assert.equal(gate.isOpen(), false);
    }
    assert.deepEqual(outboxIdentity, { accountId: saved.id, clientActionId: 'pending-1' });
  }
});

test('account switch and release replacement synchronously invalidate old request leases', () => {
  const gate = createTenantTrafficGate(() => now);
  const first = account('tenant-a:user-a', 'release-a', 'https://a.test/api');
  const second = account('tenant-b:user-b', 'release-b', 'https://b.test/api');
  gate.open(first, false);
  const firstLease = gate.lease(first);
  assert.doesNotThrow(firstLease);
  gate.close();
  assert.throws(firstLease, TenantTrafficClosedError);
  gate.open(second, false);
  assert.throws(firstLease, TenantTrafficClosedError);
  assert.doesNotThrow(gate.lease(second));
  gate.close();
  const upgraded = { ...second, descriptorRevision: 'release-c', apiBaseUrl: 'https://c.test/api' };
  gate.open(upgraded, false);
  assert.throws(gate.lease(second), TenantTrafficClosedError);
});

test('resume deduplicates expiry refresh and ignores stale completion after account replacement', async () => {
  let time = now;
  let expiresAt = now + 100;
  let refreshes = 0;
  let closeCalls = 0;
  let resolveRefresh!: () => void;
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const scheduler = createDescriptorLifecycleScheduler({
    expiresAt: () => expiresAt, now: () => time, closeTraffic: () => { closeCalls += 1; },
    refresh: () => { refreshes += 1; return new Promise<void>((resolve) => { resolveRefresh = resolve; }); },
    setTimer: ((callback: () => void) => { timers.set(++timerId, callback); return timerId; }) as typeof setTimeout,
    clearTimer: ((id: number) => { timers.delete(id); }) as typeof clearTimeout,
  });
  scheduler.resume();
  assert.equal(refreshes, 0);
  time = now + 101;
  scheduler.resume(); scheduler.resume();
  assert.equal(refreshes, 1);
  assert.equal(closeCalls, 1);
  scheduler.replace();
  expiresAt = time + 500;
  resolveRefresh();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(timers.size, 0);
  scheduler.dispose();
});

test('successful grace refresh retries on the bounded interval instead of spinning', async () => {
  const delays: number[] = [];
  const scheduler = createDescriptorLifecycleScheduler({
    expiresAt: () => 99,
    now: () => 100,
    closeTraffic: () => undefined,
    refresh: async () => undefined,
    setTimer: ((callback: () => void, delay: number) => {
      delays.push(delay);
      if (delays.length === 1) callback();
      return delays.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout,
    clearTimer: (() => undefined) as typeof clearTimeout,
    retryMs: 60_000,
  });

  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(delays, [0, 60_000]);
  scheduler.dispose();
});

function outboxStore(): HomeworkStore & { rows: Map<string, HomeworkMutation> } {
  const rows = new Map<string, HomeworkMutation>();
  return { rows, async recover() {}, async getRunnable(accountId) { return [...rows.values()].find((item) => item.accountId === accountId) ?? null; }, async getByAccount(accountId) { return [...rows.values()].filter((item) => item.accountId === accountId); }, async put(item) { rows.set(item.id, item); }, async remove(id) { rows.delete(id); }, async removeAccount(accountId) { for (const [id, item] of rows) if (item.accountId === accountId) rows.delete(id); } };
}

test('upgrade enables provider only after acceptance and downgrade retains pending outbox identity', async () => {
  const saved = account('tenant-a:user-a', 'release-a', 'https://a.test/api');
  saved.descriptorCapabilities!.offline_homework_state = false;
  let enabled = false;
  const data = outboxStore();
  const sent: string[] = [];
  const outbox = createHomeworkOutbox({ store: data, canSend: () => enabled, key: () => 'stable-action', send: async (item) => { sent.push(item.clientActionId); return { type: 'success', state: { status: item.status, version: 2, completed_at: null } }; } });
  await outbox.enqueue(saved.id, 7, 1, 'completed');
  await outbox.run(saved.id);
  assert.equal(data.rows.get('stable-action')?.accountId, saved.id);
  const upgraded = await resolveAccountDescriptor({ ...saved, descriptorExpiresAt: new Date(now - 1).toISOString() }, { discoverById: async () => discovery(saved, 'release-b', 'https://b.test/api', true), discoverByHost: async () => { throw new Error('unexpected'); }, appVersion: '1.0.0', now: () => now });
  enabled = upgraded.account.descriptorCapabilities!.offline_homework_state;
  await outbox.run(saved.id);
  assert.deepEqual(sent, ['stable-action']);
  await outbox.enqueue(saved.id, 8, 2, 'completed');
  const downgraded = await resolveAccountDescriptor({ ...upgraded.account, descriptorExpiresAt: new Date(now - 1).toISOString() }, { discoverById: async () => discovery(saved, 'release-c', 'https://c.test/api', false), discoverByHost: async () => { throw new Error('unexpected'); }, appVersion: '1.0.0', now: () => now });
  enabled = downgraded.account.descriptorCapabilities!.offline_homework_state;
  await outbox.run(saved.id);
  assert.equal(data.rows.get('stable-action')?.accountId, saved.id);
  assert.equal(data.rows.get('stable-action')?.clientActionId, 'stable-action');
});
