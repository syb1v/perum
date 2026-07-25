import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldPersistQuery } from './policy';

test('persists only explicitly reviewed account query families', () => {
  const query = (queryKey: readonly unknown[], status = 'success') => ({ queryKey, state: { status } }) as never;
  assert.equal(shouldPersistQuery(query(['account', 'a', 'homework'])), true);
  assert.equal(shouldPersistQuery(query(['account', 'a', 'academics', 'diary'])), true);
  assert.equal(shouldPersistQuery(query(['account', 'a', 'academics', 'teacher-works'])), true);
  assert.equal(shouldPersistQuery(query(['account', 'a', 'user', 'me'])), false);
  assert.equal(shouldPersistQuery(query(['auth', 'tokens'])), false);
  assert.equal(shouldPersistQuery(query(['account', 'a', 'homework'], 'error')), false);
});
