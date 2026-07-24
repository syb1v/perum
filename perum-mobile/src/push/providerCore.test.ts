import assert from 'node:assert/strict';
import test from 'node:test';
import { acquirePushToken, type PushTokenProvider } from './providerCore';

test('push token acquisition stays behind a typed provider boundary', async () => {
  const calls: string[] = [];
  const provider: PushTokenProvider = { getToken: async (projectId) => { calls.push(projectId); return ' token '; } };
  assert.equal(await acquirePushToken(provider, 'project'), 'token');
  assert.deepEqual(calls, ['project']);
  await assert.rejects(() => acquirePushToken({ getToken: async () => ' ' }, 'project'), /empty token/);
});
