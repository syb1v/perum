import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePerumLink, targetRoute } from './core';

const id = '123e4567-e89b-12d3-a456-426614174000';

test('parses only allowlisted links without payload data', () => {
  assert.deepEqual(parsePerumLink(`https://links.example/s/${id}/support`, 'links.example'), { schoolPublicId: id, target: 'support' });
  assert.deepEqual(parsePerumLink(`perum://s/${id}/messages`, 'links.example'), { schoolPublicId: id, target: 'messages' });
  assert.equal(parsePerumLink(`https://evil.example/s/${id}/support`, 'links.example'), null);
  assert.equal(parsePerumLink(`https://links.example/s/${id}/support?token=secret`, 'links.example'), null);
});

test('routes only supported role targets', () => {
  assert.equal(targetRoute('messages', 'student'), '/(student)/messages');
  assert.equal(targetRoute('messages', 'parent'), null);
  assert.equal(targetRoute('support', 'teacher'), '/support');
});
