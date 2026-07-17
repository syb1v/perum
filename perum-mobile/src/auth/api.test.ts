import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountClient, setAccessToken } from './api';
import type { TenantAccount } from './types';

function account(id: string): TenantAccount {
  return {
    id, tenantId: id, schoolId: id, tenantName: id, tenantHost: `${id}.test`, apiBaseUrl: `https://${id}.test/api`, descriptorRevision: 'r1',
    descriptorExpiresAt: '2099-01-01T00:00:00.000Z', descriptorLastVerifiedAt: '2026-01-01T00:00:00.000Z', descriptorSchemaVersion: 1,
    descriptorCompatibility: { mobile_api_version: 1, minimum_mobile_api_version: 1, minimum_app_version: '0.0.0' }, descriptorCapabilities: {} as never,
    user: { id, login: id, role: 'student', full_name: id }, refreshToken: `refresh-${id}`,
  } as unknown as TenantAccount;
}

test('failed refresh-token persistence never publishes rotated access token or affects another account', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const first = account('first');
  const second = account('second');
  setAccessToken(first.id, 'access-first');
  setAccessToken(second.id, 'access-second');
  const requests: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({ url, authorization: headers.get('Authorization') });
    if (url.endsWith('/auth/refresh')) return new Response(JSON.stringify({ access_token: 'rotated-access', refresh_token: 'rotated-refresh' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('first.test')) return new Response(JSON.stringify({ detail: 'expired' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const firstClient = createAccountClient(first, async () => { throw new Error('secure storage failed'); }, async () => undefined);
  const secondClient = createAccountClient(second, async () => undefined, async () => undefined);
  await assert.rejects(firstClient.get('/user/me'), /Сессия истекла/);
  assert.equal(first.refreshToken, 'refresh-first');
  await secondClient.get('/user/me');
  assert.equal(requests.filter((request) => request.authorization === 'Bearer rotated-access').length, 0);
  assert.equal(requests.at(-1)?.authorization, 'Bearer access-second');
});
