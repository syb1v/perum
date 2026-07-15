import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePerumLink, targetRoute } from './core';

const id = '123e4567-e89b-12d3-a456-426614174000';

test('parses only allowlisted links without payload data', () => {
  assert.deepEqual(parsePerumLink(`https://link.perum.app/s/${id}/support`), { schoolPublicId: id, target: 'support' });
  assert.deepEqual(parsePerumLink(`perum://s/${id}/messages`), { schoolPublicId: id, target: 'messages' });
  assert.equal(parsePerumLink(`https://evil.example/s/${id}/support`), null);
  assert.equal(parsePerumLink(`https://link.perum.app/s/${id}/support?token=secret`), null);
});

test('routes only supported role targets', () => {
  assert.equal(targetRoute('messages', 'student'), '/(student)/messages');
  assert.equal(targetRoute('messages', 'parent'), null);
  assert.equal(targetRoute('support', 'teacher'), '/support');
});
