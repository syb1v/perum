import { createApiClient, createTenantApiClient, type ApiClient, type TenantSessionProvider } from '@perum/api-client';
import type { Discovery, LoginRequest, LoginResponse, TenantAccount, TenantUser } from './types';
import { leaseApiClient } from './trafficCore';
import { runtimeConfig } from '../config/runtime';

const coreApiUrl = runtimeConfig.coreApiUrl;
const accessTokens = new Map<string, string>();

function normalizeApiUrl(url: string) {
  return url.replace(/\/$/, '');
}

export async function discoverTenant(host: string): Promise<Discovery> {
  const client = createApiClient({ baseUrl: coreApiUrl });
  return client.get<Discovery>(`/public/tenant-discovery?host=${encodeURIComponent(host.trim().toLowerCase())}`);
}

export async function discoverTenantById(schoolPublicId: string): Promise<Discovery> {
  const client = createApiClient({ baseUrl: coreApiUrl });
  return client.post<Discovery>('/public/tenant-discovery', { school_public_id: schoolPublicId });
}

export async function tenantLogin(discovery: Discovery, body: LoginRequest) {
  const client = createApiClient({ baseUrl: normalizeApiUrl(discovery.api_base_url) });
  return client.post<LoginResponse>('/login', body);
}

export async function fetchMe(apiBaseUrl: string, accessToken: string): Promise<TenantUser> {
  const client = createApiClient({
    baseUrl: normalizeApiUrl(apiBaseUrl),
    tokenProvider: { getAccessToken: () => accessToken, clear: () => undefined },
  });
  return client.get<TenantUser>('/user/me');
}

export function setAccessToken(accountId: string, token: string) {
  accessTokens.set(accountId, token);
}

export function clearAccessToken(accountId: string) {
  accessTokens.delete(accountId);
}

export function createAccountClient(
  account: TenantAccount,
  updateRefreshToken: (refreshToken: string) => Promise<void>,
  clear: () => Promise<void>,
  assertLease: () => void = () => undefined,
): ApiClient {
  let refreshToken = account.refreshToken;
  const provider: TenantSessionProvider = {
    getAccessToken: () => accessTokens.get(account.id) ?? null,
    getRefreshToken: () => refreshToken,
    setTokens: async (tokens) => {
      await updateRefreshToken(tokens.refreshToken);
      refreshToken = tokens.refreshToken;
      accessTokens.set(account.id, tokens.accessToken);
    },
    clear: async () => {
      accessTokens.delete(account.id);
      await clear();
    },
  };
  return leaseApiClient(createTenantApiClient({
    baseUrl: normalizeApiUrl(account.apiBaseUrl),
    sessionNamespace: `${account.tenantId}:${account.user.id}`,
    sessionProvider: provider,
    refreshEndpoint: '/auth/refresh',
    getAdditionalHeaders: async () => {
      assertLease();
      return {};
    },
  }), assertLease);
}
