import Constants from 'expo-constants';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { clearAccessToken, createAccountClient, discoverTenant, discoverTenantById, fetchMe, setAccessToken, tenantLogin } from './api';
import { loadRegistry, saveRegistry } from './storage';
import type { Registry, TenantAccount, TenantRole, TenantUser } from './types';
import { removeAccountLocalData } from '../query/persistence';
import type { ApiClient } from '@perum/api-client';
import { applyDiscovery, assertDiscoveryCompatibility, resolveAccountDescriptor } from './descriptorCore';

const roles = new Set<TenantRole>(['student', 'parent', 'teacher', 'admin', 'school_admin', 'director']);

type AuthContextValue = {
  ready: boolean;
  busy: boolean;
  account: TenantAccount | null;
  apiClient: ApiClient | null;
  accounts: TenantAccount[];
  error: string | null;
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

  async function persist(next: Registry) {
    setRegistry(next);
    await saveRegistry(next);
  }

  async function removeAccount(accountId: string, source = registry) {
    clearAccessToken(accountId);
    await removeAccountLocalData(accountId);
    const accounts = source.accounts.filter((item) => item.id !== accountId);
    const selectedAccountId = source.selectedAccountId === accountId ? accounts[0]?.id ?? null : source.selectedAccountId;
    const next = { accounts, selectedAccountId };
    await persist(next);
    if (account?.id === accountId) setAccount(null);
    return next;
  }

  async function restore(saved: TenantAccount, source: Registry) {
    let terminalAuthFailure = false;
    const resolution = await resolveAccountDescriptor(saved, {
      discoverById: discoverTenantById,
      discoverByHost: discoverTenant,
    });
    saved = resolution.account;
    if (resolution.source === 'rediscovered') {
      source = {
        ...source,
        accounts: source.accounts.map((item) => item.id === saved.id ? saved : item),
      };
      await persist(source);
    }
    const client = createAccountClient(
      saved,
      async (refreshToken) => {
        const next = { ...source, accounts: source.accounts.map((item) => item.id === saved.id ? { ...item, refreshToken } : item) };
        source = next;
        await persist(next);
      },
      async () => {
        terminalAuthFailure = true;
        await removeAccount(saved.id, source);
      },
    );
    try {
      const user = await client.get<TenantUser>('/user/me');
      assertTenantUser(user);
      const updated = { ...saved, user };
      const next = { ...source, selectedAccountId: saved.id, accounts: source.accounts.map((item) => item.id === saved.id ? updated : item) };
      await persist(next);
      setAccount(updated);
    } catch (restoreError) {
      if (terminalAuthFailure) throw restoreError;
      const next = { ...source, selectedAccountId: saved.id };
      await persist(next);
      setAccount(saved);
    }
  }

  useEffect(() => {
    void (async () => {
      const saved = await loadRegistry();
      setRegistry(saved);
      const selected = saved.accounts.find((item) => item.id === saved.selectedAccountId);
      if (selected) {
        try {
          await restore(selected, saved);
        } catch (restoreError) {
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
      assertDiscoveryCompatibility(discovery.compatibility);
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
        descriptorCompatibility: discovery.compatibility,
        user,
        refreshToken: response.refresh_token,
      };
      setAccessToken(id, accessToken);
      const next = {
        selectedAccountId: id,
        accounts: [...registry.accounts.filter((item) => item.id !== id), nextAccount],
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
    const selected = registry.accounts.find((item) => item.id === accountId);
    if (!selected || selected.id === account?.id) return;
    setBusy(true);
    setError(null);
    try {
      await restore(selected, registry);
    } catch (switchError) {
      setError(messageOf(switchError));
      throw switchError;
    } finally {
      setBusy(false);
    }
  }

  async function refreshAccountDescriptor(accountId: string) {
    const current = registry.accounts.find((item) => item.id === accountId);
    if (!current) return;
    const discovery = current.schoolId
      ? await discoverTenantById(current.schoolId)
      : await discoverTenant(current.tenantHost);
    const updated = applyDiscovery(current, discovery);
    const next = { ...registry, accounts: registry.accounts.map((item) => item.id === accountId ? updated : item) };
    await persist(next);
    if (account?.id === accountId) setAccount(updated);
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

  const apiClient = account ? createAccountClient(
    account,
    async (refreshToken) => {
      const next = { ...registry, accounts: registry.accounts.map((item) => item.id === account.id ? { ...item, refreshToken } : item) };
      await persist(next);
    },
    async () => { await removeAccount(account.id); },
  ) : null;

  return <AuthContext.Provider value={{ ready, busy, account, apiClient, accounts: registry.accounts, error, signIn, switchAccount, refreshAccountDescriptor, signOut, clearError: () => setError(null) }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
}
