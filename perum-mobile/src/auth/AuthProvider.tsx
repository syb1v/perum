import Constants from 'expo-constants';
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { clearAccessToken, createAccountClient, discoverTenant, discoverTenantById, fetchMe, setAccessToken, tenantLogin } from './api';
import { loadRegistry, saveRegistry } from './storage';
import type { Registry, TenantAccount, TenantRole, TenantUser } from './types';
import { removeAccountLocalData } from '../query/persistence';
import type { ApiClient } from '@perum/api-client';
import { assertDiscoveryDescriptor, DescriptorGateError, resolveAccountDescriptor, type DescriptorReason, type InternalDescriptorReason } from './descriptorCore';

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
  const appVersion = Constants.expoConfig?.version ?? '0.0.0';

  async function persist(next: Registry) {
    registryRef.current = next;
    setRegistry(next);
    const write = writeQueue.current.then(() => saveRegistry(next));
    writeQueue.current = write.catch(() => undefined);
    await write;
  }

  async function updateRegistry(update: (current: Registry) => Registry) {
    const next = update(registryRef.current);
    await persist(next);
    return next;
  }

  async function removeAccount(accountId: string) {
    clearAccessToken(accountId);
    await removeAccountLocalData(accountId);
    const next = await updateRegistry((current) => {
      const accounts = current.accounts.filter((item) => item.id !== accountId);
      return { accounts, selectedAccountId: current.selectedAccountId === accountId ? accounts[0]?.id ?? null : current.selectedAccountId };
    });
    if (account?.id === accountId) setAccount(null);
    return next;
  }

  async function restore(saved: TenantAccount, source: Registry) {
    let terminalAuthFailure = false;
    const resolution = await resolveAccountDescriptor(saved, {
      discoverById: discoverTenantById,
      discoverByHost: discoverTenant,
      appVersion,
    });
    setDescriptorGateReason(resolution.degradedReason ?? null);
    saved = resolution.account;
    if (resolution.source === 'rediscovered') {
      source = await updateRegistry((current) => ({ ...current, accounts: current.accounts.map((item) => item.id === saved.id ? { ...item, ...saved } : item) }));
    }
    const client = createAccountClient(
      saved,
      async (refreshToken) => {
        source = await updateRegistry((current) => ({ ...current, accounts: current.accounts.map((item) => item.id === saved.id ? { ...item, refreshToken } : item) }));
      },
      async () => {
        terminalAuthFailure = true;
        await removeAccount(saved.id);
      },
    );
    try {
      const user = await client.get<TenantUser>('/user/me');
      assertTenantUser(user);
      const updated = { ...saved, user };
      const next = await updateRegistry((current) => ({ ...current, selectedAccountId: saved.id, accounts: current.accounts.map((item) => item.id === saved.id ? { ...item, ...updated } : item) }));
      setAccount(updated);
    } catch (restoreError) {
      if (terminalAuthFailure) throw restoreError;
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
          setAccount(selected);
          setError(messageOf(restoreError));
        }
      }
      setReady(true);
    })();
  }, []);

  async function signIn(host: string, login: string, password: string) {
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
        descriptorCapabilities: discovery.capabilities,
        user,
        refreshToken: response.refresh_token,
      };
      setAccessToken(id, accessToken);
      setDescriptorGateReason(null);
      const next = {
        selectedAccountId: id,
        accounts: [...registryRef.current.accounts.filter((item) => item.id !== id), nextAccount],
      };
      await persist(next);
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
    setAccount(null);
    try {
      await restore(selected, registryRef.current);
    } catch (switchError) {
      if (switchError instanceof DescriptorGateError) setDescriptorGateReason(switchError.reason);
      setAccount(selected);
      setError(messageOf(switchError));
      throw switchError;
    } finally {
      setBusy(false);
    }
  }

  async function refreshAccountDescriptor(accountId: string) {
    const current = registryRef.current.accounts.find((item) => item.id === accountId);
    if (!current) return;
    try {
      const resolution = await resolveAccountDescriptor(current, { discoverById: discoverTenantById, discoverByHost: discoverTenant, appVersion, force: true });
      const updated = resolution.account;
      setDescriptorGateReason(resolution.degradedReason ?? null);
      const next = await updateRegistry((latest) => ({ ...latest, accounts: latest.accounts.map((item) => item.id === accountId ? { ...item, ...updated, refreshToken: item.refreshToken, user: item.user } : item) }));
      if (account?.id === accountId) setAccount(next.accounts.find((item) => item.id === accountId) ?? updated);
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
      const client = createAccountClient(current, async () => undefined, async () => undefined);
      await client.post('/logout');
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
  const apiClient = account && descriptorAllowsTraffic ? createAccountClient(
    account,
    async (refreshToken) => {
      await updateRegistry((current) => ({ ...current, accounts: current.accounts.map((item) => item.id === account.id ? { ...item, refreshToken } : item) }));
    },
    async () => { await removeAccount(account.id); },
  ) : null;

  return <AuthContext.Provider value={{ ready, busy, account, apiClient, accounts: registry.accounts, error, descriptorReason, signIn, switchAccount, refreshAccountDescriptor, signOut, clearError: () => setError(null) }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
}
