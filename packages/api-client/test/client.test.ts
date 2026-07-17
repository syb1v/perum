import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ApiClientError,
  createApiClient,
  createMediaUploadSession,
  createTenantApiClient,
  downloadMediaObject,
  TenantSessionTokens,
  uploadMediaSession,
  waitForMediaObjectTerminal,
} from '../src/index.ts';

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

function createSessionProvider(initial: TenantSessionTokens) {
  let tokens = initial;
  let clearCount = 0;
  return {
    getAccessToken: () => tokens.accessToken,
    getRefreshToken: () => tokens.refreshToken,
    setTokens: (next: TenantSessionTokens) => { tokens = next; },
    clear: () => { clearCount += 1; },
    get tokens() { return tokens; },
    get clearCount() { return clearCount; },
  };
}

test('refreshes once and retries concurrent requests with rotated tokens', async () => {
  const session = createSessionProvider({ accessToken: 'expired', refreshToken: 'refresh-1' });
  let refreshCount = 0;
  const requestTokens: string[] = [];
  const client = createTenantApiClient({
    baseUrl: 'https://school.example/api',
    sessionNamespace: 'tenant-1:user-1',
    sessionProvider: session,
    fetch: async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshCount += 1;
        assert.deepEqual(JSON.parse(String(init?.body)), { refresh_token: 'refresh-1' });
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new Response(JSON.stringify({ access_token: 'current', refresh_token: 'refresh-2' }), { status: 200 });
      }
      const authorization = new Headers(init?.headers).get('Authorization') || '';
      requestTokens.push(authorization);
      return authorization === 'Bearer current'
        ? new Response(JSON.stringify({ ok: true }), { status: 200 })
        : new Response(JSON.stringify({ detail: 'expired' }), { status: 401 });
    },
  });

  const results = await Promise.all(Array.from({ length: 10 }, () => client.get('/user/me')));

  assert.equal(refreshCount, 1);
  assert.deepEqual(results, Array.from({ length: 10 }, () => ({ ok: true })));
  assert.deepEqual(session.tokens, { accessToken: 'current', refreshToken: 'refresh-2' });
  assert.equal(requestTokens.filter((token) => token === 'Bearer current').length, 10);
});

test('isolates refresh flights and failures by tenant account namespace', async () => {
  const failedSession = createSessionProvider({ accessToken: 'expired-a', refreshToken: 'refresh-a' });
  const validSession = createSessionProvider({ accessToken: 'expired-b', refreshToken: 'refresh-b' });
  const refreshes: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/auth/refresh')) {
      const refreshToken = JSON.parse(String(init?.body)).refresh_token;
      refreshes.push(refreshToken);
      return refreshToken === 'refresh-a'
        ? new Response(JSON.stringify({ detail: 'expired' }), { status: 401 })
        : new Response(JSON.stringify({ access_token: 'current-b', refresh_token: 'refresh-b2' }), { status: 200 });
    }
    const authorization = new Headers(init?.headers).get('Authorization');
    return authorization === 'Bearer current-b'
      ? new Response(JSON.stringify({ tenant: 'b' }), { status: 200 })
      : new Response(JSON.stringify({ detail: 'expired' }), { status: 401 });
  };
  const failedClient = createTenantApiClient({
    baseUrl: 'https://a.example/api',
    sessionNamespace: 'tenant-a:user-1',
    sessionProvider: failedSession,
    fetch: fetchImpl,
  });
  const validClient = createTenantApiClient({
    baseUrl: 'https://b.example/api',
    sessionNamespace: 'tenant-b:user-1',
    sessionProvider: validSession,
    fetch: fetchImpl,
  });

  const [failed, valid] = await Promise.allSettled([failedClient.get('/user/me'), validClient.get('/user/me')]);

  assert.equal(failed.status, 'rejected');
  assert.deepEqual(valid, { status: 'fulfilled', value: { tenant: 'b' } });
  assert.deepEqual(refreshes.sort(), ['refresh-a', 'refresh-b']);
  assert.equal(failedSession.clearCount, 1);
  assert.equal(validSession.clearCount, 0);
});

test('does not clear an account when rotated token persistence fails', async () => {
  const session = createSessionProvider({ accessToken: 'expired', refreshToken: 'refresh' });
  session.setTokens = async () => { throw new Error('secure storage failed'); };
  const client = createTenantApiClient({
    baseUrl: 'https://tenant.example/api',
    sessionNamespace: 'tenant:persistence-failure',
    sessionProvider: session,
    fetch: async (input) => String(input).endsWith('/auth/refresh')
      ? new Response(JSON.stringify({ access_token: 'rotated', refresh_token: 'rotated-refresh' }), { status: 200 })
      : new Response(JSON.stringify({ detail: 'expired' }), { status: 401 }),
  });

  await assert.rejects(client.get('/user/me'), ApiClientError);
  assert.equal(session.clearCount, 0);
  assert.equal(await session.getAccessToken(), 'expired');
  assert.equal(await session.getRefreshToken(), 'refresh');
});

test('does not retry forever after a refreshed request returns 401', async () => {
  const session = createSessionProvider({ accessToken: 'expired', refreshToken: 'refresh' });
  let refreshCount = 0;
  let unauthorizedCount = 0;
  const client = createTenantApiClient({
    baseUrl: '/api',
    sessionNamespace: 'tenant:user',
    sessionProvider: session,
    fetch: async (input) => {
      if (String(input).endsWith('/auth/refresh')) {
        refreshCount += 1;
        return new Response(JSON.stringify({ access_token: 'still-invalid', refresh_token: 'rotated' }), { status: 200 });
      }
      return new Response(JSON.stringify({ detail: 'unauthorized' }), { status: 401 });
    },
    onUnauthorized: () => { unauthorizedCount += 1; },
  });

  await assert.rejects(client.get('/user/me'), ApiClientError);
  assert.equal(refreshCount, 1);
  assert.equal(unauthorizedCount, 1);
});

test('late 401 retries with the rotated token without a second refresh', async () => {
  const session = createSessionProvider({ accessToken: 'expired', refreshToken: 'refresh-1' });
  let expiredRequestCount = 0;
  let refreshCount = 0;
  const client = createTenantApiClient({
    baseUrl: '/api',
    sessionNamespace: 'tenant:late-user',
    sessionProvider: session,
    fetch: async (input, init) => {
      if (String(input).endsWith('/auth/refresh')) {
        refreshCount += 1;
        return new Response(JSON.stringify({ access_token: 'current', refresh_token: 'refresh-2' }), { status: 200 });
      }
      const authorization = new Headers(init?.headers).get('Authorization');
      if (authorization === 'Bearer current') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      expiredRequestCount += 1;
      if (expiredRequestCount === 2) {
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      return new Response(JSON.stringify({ detail: 'expired' }), { status: 401 });
    },
  });

  const results = await Promise.all([client.get('/first'), client.get('/late')]);

  assert.deepEqual(results, [{ ok: true }, { ok: true }]);
  assert.equal(refreshCount, 1);
});

test('uploads media multipart without setting content type', async () => {
  let requestInit: RequestInit | undefined;
  const client = createApiClient({
    baseUrl: '/api',
    fetch: async (_input, init) => {
      requestInit = init;
      return new Response(JSON.stringify({ id: 'object-1', state: 'pending' }), { status: 200 });
    },
  });

  await uploadMediaSession(client, 'session/1', new Blob(['content'], { type: 'text/plain' }));

  assert.equal(requestInit?.method, 'PUT');
  assert.equal(new Headers(requestInit?.headers).has('Content-Type'), false);
  assert.ok(requestInit?.body instanceof FormData);
  assert.ok(requestInit.body.get('file') instanceof Blob);
});

test('returns authenticated binary response without parsing its body', async () => {
  const bytes = new Uint8Array([0, 1, 2, 255]);
  let authorization = '';
  const client = createApiClient({
    baseUrl: '/api',
    tokenProvider: { getAccessToken: () => 'media-token', clear: () => undefined },
    fetch: async (_input, init) => {
      authorization = new Headers(init?.headers).get('Authorization') || '';
      return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
    },
  });

  const response = await downloadMediaObject(client, 'object/1');

  assert.equal(authorization, 'Bearer media-token');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('refreshes once and retries a binary request once', async () => {
  const session = createSessionProvider({ accessToken: 'expired', refreshToken: 'refresh' });
  let refreshCount = 0;
  let contentCount = 0;
  const client = createTenantApiClient({
    baseUrl: '/api',
    sessionNamespace: 'tenant:media-user',
    sessionProvider: session,
    fetch: async (input, init) => {
      if (String(input).endsWith('/auth/refresh')) {
        refreshCount += 1;
        return new Response(JSON.stringify({ access_token: 'current', refresh_token: 'rotated' }), { status: 200 });
      }
      contentCount += 1;
      return new Headers(init?.headers).get('Authorization') === 'Bearer current'
        ? new Response(new Uint8Array([7, 8, 9]), { status: 200 })
        : new Response(JSON.stringify({ detail: 'expired' }), { status: 401 });
    },
  });

  const response = await downloadMediaObject(client, 'object-1');

  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([7, 8, 9]));
  assert.equal(refreshCount, 1);
  assert.equal(contentCount, 2);
});

test('media polling returns terminal state and is bounded', async () => {
  let requestCount = 0;
  const client = createApiClient({
    baseUrl: '/api',
    fetch: async () => {
      requestCount += 1;
      const state = requestCount === 3 ? 'clean' : 'pending';
      return new Response(JSON.stringify({ id: 'object-1', state }), { status: 200 });
    },
  });

  const object = await waitForMediaObjectTerminal(client, 'object-1', {
    initialDelayMs: 0,
    maxDelayMs: 0,
    maxAttempts: 3,
  });
  assert.equal(object.state, 'clean');
  assert.equal(requestCount, 3);

  requestCount = 0;
  await assert.rejects(waitForMediaObjectTerminal(client, 'object-1', {
    initialDelayMs: 0,
    maxDelayMs: 0,
    maxAttempts: 2,
  }), /did not reach a terminal state/);
  assert.equal(requestCount, 2);
});

test('media polling aborts during backoff', async () => {
  const controller = new AbortController();
  let requestCount = 0;
  const client = createApiClient({
    baseUrl: '/api',
    fetch: async () => {
      requestCount += 1;
      return new Response(JSON.stringify({ id: 'object-1', state: 'pending' }), { status: 200 });
    },
  });
  const polling = waitForMediaObjectTerminal(client, 'object-1', {
    initialDelayMs: 10_000,
    maxAttempts: 5,
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 0);

  await assert.rejects(polling, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
  assert.equal(requestCount, 1);
});

test('media create helper uses generated request shape', async () => {
  let body = '';
  const client = createApiClient({
    baseUrl: '/api',
    fetch: async (_input, init) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ id: 'session-1', state: 'created' }), { status: 201 });
    },
  });
  const payload = {
    client_upload_id: 'client-1',
    purpose: 'social_attachment',
    filename: 'photo.png',
    mime_type: 'image/png',
    size: 10,
    sha256: 'digest',
  };

  await createMediaUploadSession(client, payload);

  assert.deepEqual(JSON.parse(body), payload);
});
