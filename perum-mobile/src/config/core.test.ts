import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRuntimeConfig } from './core';

test('normalizes one strict runtime configuration', () => {
  assert.deepEqual(parseRuntimeConfig({ buildEnvironment: 'preview', coreApiUrl: 'https://core.example/api/', linkHost: 'links.example', projectId: '123e4567-e89b-42d3-a456-426614174000' }), {
    buildEnvironment: 'preview', coreApiUrl: 'https://core.example/api', linkHost: 'links.example', projectId: '123e4567-e89b-42d3-a456-426614174000',
  });
});

test('rejects unsafe, malformed and incomplete release configuration', () => {
  assert.throws(() => parseRuntimeConfig({ buildEnvironment: 'production', coreApiUrl: 'http://core.example/api', linkHost: 'links.example', projectId: '123e4567-e89b-42d3-a456-426614174000' }), /HTTPS/);
  assert.throws(() => parseRuntimeConfig({ buildEnvironment: 'preview', coreApiUrl: 'https://core.example/api', linkHost: 'Links.example', projectId: '123e4567-e89b-42d3-a456-426614174000' }), /lowercase/);
  assert.throws(() => parseRuntimeConfig({ buildEnvironment: 'production', coreApiUrl: 'https://core.example/api', linkHost: 'links.example' }), /EXPO_PROJECT_ID/);
});

test('allows only explicit loopback HTTP in development', () => {
  assert.equal(parseRuntimeConfig({ coreApiUrl: 'http://10.0.2.2:8000/api', linkHost: 'links.example' }).coreApiUrl, 'http://10.0.2.2:8000/api');
  assert.throws(() => parseRuntimeConfig({ coreApiUrl: 'http://192.168.1.2:8000/api', linkHost: 'links.example' }), /HTTPS/);
});
