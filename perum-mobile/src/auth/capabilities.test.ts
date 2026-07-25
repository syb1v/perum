import assert from 'node:assert/strict';
import test from 'node:test';
import { hasCapabilities, hasCapability } from './capabilities';
import type { TenantAccount } from './types';

const base = { descriptorCapabilities: { social_messages: true, social_realtime: false, student_academics: true } } as TenantAccount;

test('capability selectors are fail closed', () => {
  assert.equal(hasCapability(base, 'social_messages'), true);
  assert.equal(hasCapability(base, 'student_academics'), true);
  assert.equal(hasCapability(base, 'social_realtime'), false);
  assert.equal(hasCapability(null, 'social_messages'), false);
  assert.equal(hasCapabilities(base, ['social_messages', 'social_realtime']), false);
});

test('capabilities remain account specific', () => {
  const other = { descriptorCapabilities: { social_messages: false } } as TenantAccount;
  assert.equal(hasCapability(base, 'social_messages'), true);
  assert.equal(hasCapability(other, 'social_messages'), false);
});
