import assert from 'node:assert/strict';
import test from 'node:test';
import { hasActivePushRegistration, type PushRegistrationStatus } from './types';

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
