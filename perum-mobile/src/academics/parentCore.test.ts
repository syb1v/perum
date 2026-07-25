import assert from 'node:assert/strict';
import test from 'node:test';
import { selectParentChild } from './parentCore';

test('parent child selection stays stable and falls back safely', () => {
  const children = [{ id: 1 }, { id: 2 }];
  assert.equal(selectParentChild(children, 2), 2);
  assert.equal(selectParentChild(children, 3), 1);
  assert.equal(selectParentChild([], 1), null);
});
