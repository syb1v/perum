import assert from 'node:assert/strict';
import test from 'node:test';
import { hasActivePushRegistration, parsePushTap, type PushRegistrationStatus } from './types';

const status: PushRegistrationStatus = {
  registration_supported: true,
  registration_available: true,
  delivery_enabled: false,
  configured_providers: [],
  registration: null,
};

test('push status restores registration from the server receipt without implying delivery', () => {
  assert.equal(hasActivePushRegistration(status), false);
  assert.equal(hasActivePushRegistration({ ...status, registration: { installation_id: '00000000-0000-4000-8000-000000000001', state: 'active' } }), true);
  assert.equal(status.delivery_enabled, false);
});

test('accepts only bounded typed push navigation payloads', () => {
  assert.deepEqual(parsePushTap({ url: 'perum://s/123/home', ignored: 'value' }, 'notification-1'), { id: 'notification-1', url: 'perum://s/123/home' });
  assert.equal(parsePushTap({ url: 1 }, 'notification-1'), null);
  assert.equal(parsePushTap({ url: 'x'.repeat(2049) }, 'notification-1'), null);
});
