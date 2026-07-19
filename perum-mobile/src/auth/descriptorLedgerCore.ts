export const descriptorEventReasons = ['grace_fallback', 'grace_expired', 'app_outdated', 'tenant_release_outdated', 'malformed', 'identity_mismatch'] as const;
export type DescriptorEventReason = typeof descriptorEventReasons[number];
export type DescriptorEventLedger = {
  version: 1;
  counters: Record<DescriptorEventReason, number>;
  records: { reason: DescriptorEventReason; occurredAt: string }[];
};

export type DescriptorLedgerStorage = {
  get: () => Promise<string | null>;
  set: (value: string) => Promise<void>;
};

export function emptyDescriptorLedger(): DescriptorEventLedger {
  return { version: 1, counters: Object.fromEntries(descriptorEventReasons.map((reason) => [reason, 0])) as Record<DescriptorEventReason, number>, records: [] };
}

export function parseDescriptorLedger(value: string | null): DescriptorEventLedger {
  if (!value) return emptyDescriptorLedger();
  try {
    const parsed = JSON.parse(value) as DescriptorEventLedger;
    if (parsed.version !== 1 || !Array.isArray(parsed.records)) return emptyDescriptorLedger();
    const ledger = emptyDescriptorLedger();
    for (const reason of descriptorEventReasons) ledger.counters[reason] = Number.isSafeInteger(parsed.counters?.[reason]) && parsed.counters[reason] >= 0 ? parsed.counters[reason] : 0;
    ledger.records = parsed.records.filter((record) => descriptorEventReasons.includes(record?.reason) && Number.isFinite(Date.parse(record?.occurredAt))).slice(-24);
    return ledger;
  } catch {
    return emptyDescriptorLedger();
  }
}

export async function appendDescriptorEvent(storage: DescriptorLedgerStorage, reason: DescriptorEventReason, now = Date.now()) {
  const ledger = parseDescriptorLedger(await storage.get());
  ledger.counters[reason] += 1;
  ledger.records = [...ledger.records, { reason, occurredAt: new Date(now).toISOString() }].slice(-24);
  await storage.set(JSON.stringify(ledger));
  return ledger;
}

export async function readDescriptorEvents(storage: DescriptorLedgerStorage) {
  return parseDescriptorLedger(await storage.get());
}
