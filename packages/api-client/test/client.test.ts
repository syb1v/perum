import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiClientError, createApiClient } from '../src/index.ts';

test('injects bearer token and parses response', async () => {
  let authorization = '';
  const client = createApiClient({
    baseUrl: 'https://school.example/api',
    tokenProvider: { getAccessToken: () => 'token', clear: () => undefined },
    fetch: async (_input, init) => {
      authorization = new Headers(init?.headers).get('Authorization') || '';
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });

  assert.deepEqual(await client.get('/health'), { ok: true });
  assert.equal(authorization, 'Bearer token');
});

test('normalizes FastAPI validation errors', async () => {
  const client = createApiClient({
    baseUrl: '/api',
    fetch: async () => new Response(JSON.stringify({
      detail: [{ loc: ['body', 'title'], msg: 'Field required' }],
    }), { status: 422 }),
  });

  await assert.rejects(client.post('/homework', {}), (error: unknown) => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.status, 422);
    assert.equal(error.message, 'title: Field required');
    return true;
  });
});

test('calls unauthorized adapter without hiding the error', async () => {
  let unauthorized = false;
  const client = createApiClient({
    baseUrl: '/api',
    fetch: async () => new Response(JSON.stringify({ detail: 'Сессия истекла' }), { status: 401 }),
    onUnauthorized: () => { unauthorized = true; },
  });

  await assert.rejects(client.get('/user/me'), ApiClientError);
  assert.equal(unauthorized, true);
});
