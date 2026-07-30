import Constants from 'expo-constants';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { clearAccessToken, createAccountClient, discoverTenant, discoverTenantById, fetchMe, setAccessToken, tenantLogin } from './api';
import { loadRegistry, saveRegistry } from './storage';
import type { Registry, TenantAccount, TenantRole, TenantUser } from './types';
import { removeAccountLocalData } from '../query/persistence';
import type { ApiClient } from '@perum/api-client';
import { assertDiscoveryDescriptor, DescriptorGateError, normalizeCapabilities, resolveAccountDescriptor, type DescriptorReason, type InternalDescriptorReason } from './descriptorCore';
import { createTenantTrafficGate } from './trafficCore';
import { recordDescriptorEvent } from './descriptorLedger';

const roles = new Set<TenantRole>(['student', 'parent', 'teacher', 'admin', 'school_admin', 'director']);

type AuthContextValue = {
  ready: boolean;
  busy: boolean;
  account: TenantAccount | null;
  apiClient: ApiClient | null;
  accounts: TenantAccount[];
  error: string | null;
  descriptorReason: DescriptorReason | null;
  signIn: (host: string, login: string, password: string) => Promise<void>;
  switchAccount: (accountId: string) => Promise<void>;
  refreshAccountDescriptor: (accountId: string) => Promise<void>;
  closeTenantTraffic: () => void;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function assertTenantUser(user: TenantUser) {
  if (user.role === 'org_admin' || !roles.has(user.role as TenantRole)) {
    throw new Error('Эта роль не поддерживается в приложении школы');
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [registry, setRegistry] = useState<Registry>({ selectedAccountId: null, accounts: [] });
  const [account, setAccount] = useState<TenantAccount | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptorGateReason, setDescriptorGateReason] = useState<InternalDescriptorReason | null>(null);
  const registryRef = useRef(registry);
  const writeQueue = useRef(Promise.resolve());
  const trafficGate = useRef(createTenantTrafficGate());
  const trafficGeneration = useRef(0);
  const [, setTrafficVersion] = useState(0);
  const appVersion = Constants.expoConfig?.version ?? '0.0.0';

  async function persist(next: Registry) {
    const write = writeQueue.current.then(async () => {
      await saveRegistry(next);
      registryRef.current = next;
      setRegistry(next);
    });
    writeQueue.current = write.catch(() => undefined);
    await write;
  }

  async function updateRegistry(update: (current: Registry) => Registry) {
    let next: Registry | undefined;
    const write = writeQueue.current.then(async () => {
      next = update(registryRef.current);
      await saveRegistry(next);
      registryRef.current = next;
      setRegistry(next);
    });
    writeQueue.current = write.catch(() => undefined);
    await write;
    return next!;
  }

  function closeTenantTraffic() {
    trafficGeneration.current += 1;
    trafficGate.current.close();
    setTrafficVersion((value) => value + 1);
  }

  async function removeAccount(accountId: string) {
    const next = await updateRegistry((current) => {
      const accounts = current.accounts.filter((item) => item.id !== accountId);
      return { accounts, selectedAccountId: current.selectedAccountId === accountId ? accounts[0]?.id ?? null : current.selectedAccountId };
    });
    clearAccessToken(accountId);
    await removeAccountLocalData(accountId);
    if (account?.id === accountId) setAccount(null);
    return next;
  }

  async function restore(saved: TenantAccount, source: Registry) {
    closeTenantTraffic();
    const generation = trafficGeneration.current;
    let terminalAuthFailure = false;
    const resolution = await resolveAccountDescriptor(saved, {
      discoverById: discoverTenantById,
      discoverByHost: discoverTenant,
      appVersion,
      recordEvent: recordDescriptorEvent,
    });
    saved = resolution.account;
    if (resolution.source === 'rediscovered') {
      source = await updateRegistry((current) => ({ ...current, accounts: current.accounts.map((item) => item.id === saved.id ? { ...item, ...saved } : item) }));
    }
    if (generation !== trafficGeneration.current) return;
    setDescriptorGateReason(resolution.degradedReason ?? null);
    trafficGate.current.open(saved, resolution.source === 'offline-fallback');
    setTrafficVersion((value) => value + 1);
    const assertLease = trafficGate.current.lease(saved);
    const client = createAccountClient(
      saved,
      async (refreshToken) => {
        assertLease();
        source = await updateRegistry((current) => {
          assertLease();
          return { ...current, accounts: current.accounts.map((item) => item.id === saved.id ? { ...item, refreshToken } : item) };
        });
        saved = { ...saved, refreshToken };
      },
      async () => {
        assertLease();
        terminalAuthFailure = true;
        await removeAccount(saved.id);
      },
      assertLease,
    );
    try {
      const user = await client.get<TenantUser>('/user/me');
      assertTenantUser(user);
      const updated = { ...saved, user };
      const next = await updateRegistry((current) => ({ ...current, selectedAccountId: saved.id, accounts: current.accounts.map((item) => item.id === saved.id ? { ...item, ...updated } : item) }));
      if (generation !== trafficGeneration.current) return;
      setAccount(updated);
    } catch (restoreError) {
      if (terminalAuthFailure) throw restoreError;
      if (generation !== trafficGeneration.current) return;
      await updateRegistry((current) => ({ ...current, selectedAccountId: saved.id }));
      setAccount(saved);
    }
  }

  useEffect(() => {
    void (async () => {
      const saved = await loadRegistry();
      registryRef.current = saved;
      setRegistry(saved);
      const selected = saved.accounts.find((item) => item.id === saved.selectedAccountId);
      if (selected) {
        try {
          await restore(selected, saved);
        } catch (restoreError) {
          if (restoreError instanceof DescriptorGateError) setDescriptorGateReason(restoreError.reason);
          setAccount(registryRef.current.accounts.some((item) => item.id === selected.id) ? selected : null);
          setError(messageOf(restoreError));
        }
      }
      setReady(true);
    })();
  }, []);

  async function signIn(host: string, login: string, password: string) {
    closeTenantTraffic();
    setBusy(true);
    setError(null);
    try {
      const discovery = await discoverTenant(host);
      assertDiscoveryDescriptor(discovery, appVersion);
      const response = await tenantLogin(discovery, {
        login: login.trim(),
        password,
        remember_me: true,
        device_name: Constants.deviceName || 'Perum Mobile',
        device_platform: Platform.OS,
        app_version: Constants.expoConfig?.version,
      });
      const accessToken = response.access_token || response.token;
      if (!accessToken || !response.refresh_token) throw new Error('Сервер не выдал мобильную сессию');
      const user = await fetchMe(discovery.api_base_url, accessToken);
      assertTenantUser(user);
      const id = `${discovery.tenant_id}:${user.id}`;
      const nextAccount: TenantAccount = {
        id,
        tenantId: discovery.tenant_id,
        schoolId: discovery.school_id,
        tenantName: discovery.school_name,
        tenantHost: discovery.canonical_host,
        apiBaseUrl: discovery.api_base_url,
        descriptorRevision: discovery.descriptor_revision,
        descriptorExpiresAt: new Date(Date.now() + discovery.cache_ttl_seconds * 1000).toISOString(),
        descriptorLastVerifiedAt: new Date().toISOString(),
        descriptorSchemaVersion: discovery.schema_version,
        descriptorCompatibility: discovery.compatibility,
        descriptorCapabilities: normalizeCapabilities(discovery.capabilities),
        user,
        refreshToken: response.refresh_token,
      };
      const next = {
        selectedAccountId: id,
        accounts: [...registryRef.current.accounts.filter((item) => item.id !== id), nextAccount],
      };
      await persist(next);
      setAccessToken(id, accessToken);
      trafficGate.current.open(nextAccount, false);
      setTrafficVersion((value) => value + 1);
      setDescriptorGateReason(null);
      setAccount(nextAccount);
    } catch (signInError) {
      setError(messageOf(signInError));
      throw signInError;
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount(accountId: string) {
    const selected = registryRef.current.accounts.find((item) => item.id === accountId);
    if (!selected || selected.id === account?.id) return;
    setBusy(true);
    setError(null);
    closeTenantTraffic();
    setAccount(null);
    try {
      await restore(selected, registryRef.current);
    } catch (switchError) {
      if (switchError instanceof DescriptorGateError) setDescriptorGateReason(switchError.reason);
      setAccount(registryRef.current.accounts.some((item) => item.id === selected.id) ? selected : null);
      setError(messageOf(switchError));
      throw switchError;
    } finally {
      setBusy(false);
    }
  }

  async function refreshAccountDescriptor(accountId: string) {
    closeTenantTraffic();
    const generation = trafficGeneration.current;
    const current = registryRef.current.accounts.find((item) => item.id === accountId);
    if (!current) return;
    try {
      const resolution = await resolveAccountDescriptor(current, { discoverById: discoverTenantById, discoverByHost: discoverTenant, appVersion, force: true, recordEvent: recordDescriptorEvent });
      const updated = resolution.account;
      const next = await updateRegistry((latest) => ({ ...latest, accounts: latest.accounts.map((item) => item.id === accountId ? { ...item, ...updated, refreshToken: item.refreshToken, user: item.user } : item) }));
      if (generation !== trafficGeneration.current) return;
      setDescriptorGateReason(resolution.degradedReason ?? null);
      const accepted = next.accounts.find((item) => item.id === accountId) ?? updated;
      trafficGate.current.open(accepted, resolution.source === 'offline-fallback');
      setTrafficVersion((value) => value + 1);
      if (registryRef.current.selectedAccountId === accountId) setAccount(accepted);
    } catch (refreshError) {
      if (refreshError instanceof DescriptorGateError) setDescriptorGateReason(refreshError.reason);
      throw refreshError;
    }
  }

  async function signOut() {
    if (!account) return;
    setBusy(true);
    const current = account;
    try {
      if (apiClient) await apiClient.post('/logout');
    } catch {
    } finally {
      const next = await removeAccount(current.id);
      const selected = next.accounts.find((item) => item.id === next.selectedAccountId);
      if (selected) {
        try {
          await restore(selected, next);
        } catch {
        }
      }
      setBusy(false);
    }
  }

  const descriptorReason: DescriptorReason | null = descriptorGateReason === 'malformed' || descriptorGateReason === 'identity_mismatch' ? 'feature_unavailable' : descriptorGateReason;
  const descriptorAllowsTraffic = descriptorGateReason === null || descriptorGateReason === 'core_unavailable';
  const apiClient = account && descriptorAllowsTraffic && trafficGate.current.isOpen() ? createAccountClient(
    account,
    async (refreshToken) => {
      const assertLease = trafficGate.current.lease(account);
      assertLease();
      const next = await updateRegistry((current) => {
        assertLease();
        return { ...current, accounts: current.accounts.map((item) => item.id === account.id ? { ...item, refreshToken } : item) };
      });
      if (registryRef.current.selectedAccountId === account.id) setAccount(next.accounts.find((item) => item.id === account.id) ?? null);
    },
    async () => {
      const assertLease = trafficGate.current.lease(account);
      assertLease();
      await removeAccount(account.id);
    },
    trafficGate.current.lease(account),
  ) : null;

  return <AuthContext.Provider value={{ ready, busy, account, apiClient, accounts: registry.accounts, error, descriptorReason, signIn, switchAccount, refreshAccountDescriptor, closeTenantTraffic, signOut, clearError: () => setError(null) }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
}
