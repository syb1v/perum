import assert from 'node:assert/strict';
import test from 'node:test';
import { createConsumeOnceCoordinator } from './coordinatorCore';

test('serializes intents and consumes each identity once', async () => {
  const values: string[] = [];
  const coordinator = createConsumeOnceCoordinator(async (value) => { values.push(value); });
  await Promise.all([coordinator.submit('first', 'same'), coordinator.submit('duplicate', 'same'), coordinator.submit('second'), coordinator.submit('second')]);
  assert.deepEqual(values, ['first', 'second', 'second']);
});
