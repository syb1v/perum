import assert from 'node:assert/strict';
import test from 'node:test';
import { appendDescriptorEvent, emptyDescriptorLedger, parseDescriptorLedger, readDescriptorEvents } from './descriptorLedgerCore';

test('descriptor ledger is bounded, durable, and privacy safe', async () => {
  let value: string | null = null;
  const storage = { get: async () => value, set: async (next: string) => { value = next; } };
  for (let index = 0; index < 30; index += 1) await appendDescriptorEvent(storage, 'grace_fallback', index * 1000);
  await appendDescriptorEvent(storage, 'malformed', 31_000);
  const ledger = await readDescriptorEvents(storage);
  assert.equal(ledger.counters.grace_fallback, 30);
  assert.equal(ledger.counters.malformed, 1);
  assert.equal(ledger.records.length, 24);
  assert.deepEqual(Object.keys(ledger.records[0]!).sort(), ['occurredAt', 'reason']);
  assert.doesNotMatch(value!, /token|host|user|school|payload/i);
});

test('malformed persisted ledger fails closed to an empty bounded schema', () => {
  assert.deepEqual(parseDescriptorLedger('{bad'), emptyDescriptorLedger());
});
