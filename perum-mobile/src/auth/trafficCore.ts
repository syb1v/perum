import type { ApiClient } from '@perum/api-client';
import { DESCRIPTOR_GRACE_MS } from './descriptorCore';
import type { TenantAccount } from './types';

type TrafficLease = {
  epoch: number;
  accountId: string;
  revision: string;
  route: string;
  validUntil: number;
};

export class TenantTrafficClosedError extends Error {
  constructor() {
    super('Tenant traffic is closed until descriptor validation completes');
    this.name = 'TenantTrafficClosedError';
  }
}

export function createTenantTrafficGate(now: () => number = Date.now) {
  let epoch = 0;
  let current: TrafficLease | null = null;

  function close() {
    epoch += 1;
    current = null;
  }

  function open(account: TenantAccount, allowGrace: boolean) {
    const expiresAt = Date.parse(account.descriptorExpiresAt ?? '');
    if (!account.descriptorRevision || !Number.isFinite(expiresAt)) throw new TenantTrafficClosedError();
    current = {
      epoch,
      accountId: account.id,
      revision: account.descriptorRevision,
      route: account.apiBaseUrl,
      validUntil: expiresAt + (allowGrace ? DESCRIPTOR_GRACE_MS : 0),
    };
  }

  function lease(account: TenantAccount) {
    const captured = current && current.accountId === account.id
      && current.revision === account.descriptorRevision && current.route === account.apiBaseUrl
      ? { ...current }
      : null;
    return () => {
      if (!captured || !current || captured.epoch !== epoch || current.epoch !== captured.epoch
        || current.accountId !== captured.accountId || current.revision !== captured.revision
        || current.route !== captured.route || now() > current.validUntil) throw new TenantTrafficClosedError();
    };
  }

  return { close, open, lease, isOpen: () => current !== null && now() <= current.validUntil };
}

export function leaseApiClient(client: ApiClient, assertLease: () => void): ApiClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        assertLease();
        return value.apply(target, args);
      };
    },
  }) as ApiClient;
}

export function createDescriptorLifecycleScheduler(options: {
  expiresAt: () => number;
  refresh: () => Promise<void>;
  closeTraffic: () => void;
  now?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
  retryMs?: number;
}) {
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  const retryMs = options.retryMs ?? 60_000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flight: Promise<void> | null = null;
  let generation = 0;
  let active = true;

  function clearScheduled() {
    if (timer) clearTimer(timer);
    timer = null;
  }

  function schedule(delay: number) {
    clearScheduled();
    const scheduledGeneration = generation;
    timer = setTimer(() => {
      timer = null;
      if (active && scheduledGeneration === generation) void refresh();
    }, Math.max(0, delay));
  }

  async function refresh() {
    if (!active) return;
    if (flight) return flight;
    const startedGeneration = generation;
    options.closeTraffic();
    clearScheduled();
    flight = options.refresh().then(
      () => {
        if (active && startedGeneration === generation) {
          const remaining = options.expiresAt() - now();
          schedule(remaining > 0 ? remaining : retryMs);
        }
      },
      () => {
        if (active && startedGeneration === generation) schedule(retryMs);
      },
    ).finally(() => {
      if (startedGeneration === generation) flight = null;
    });
    return flight;
  }

  function resume() {
    if (!active) return;
    if (options.expiresAt() <= now()) void refresh();
    else schedule(options.expiresAt() - now());
  }

  function replace() {
    generation += 1;
    flight = null;
    clearScheduled();
  }

  function dispose() {
    active = false;
    replace();
  }

  schedule(options.expiresAt() - now());
  return { resume, refresh, replace, dispose };
}
