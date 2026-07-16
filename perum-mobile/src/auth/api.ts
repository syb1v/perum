import { createApiClient, createTenantApiClient, type ApiClient, type TenantSessionProvider } from '@perum/api-client';
import type { Discovery, LoginRequest, LoginResponse, TenantAccount, TenantUser } from './types';

const coreApiUrl = (process.env.EXPO_PUBLIC_CORE_API_URL || 'https://admin.perum.app/api').replace(/\/$/, '');
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
): ApiClient {
  const provider: TenantSessionProvider = {
    getAccessToken: () => accessTokens.get(account.id) ?? null,
    getRefreshToken: () => account.refreshToken,
    setTokens: async ({ accessToken, refreshToken }) => {
      accessTokens.set(account.id, accessToken);
      await updateRefreshToken(refreshToken);
      account.refreshToken = refreshToken;
    },
    clear: async () => {
      accessTokens.delete(account.id);
      await clear();
    },
  };
  return createTenantApiClient({
    baseUrl: normalizeApiUrl(account.apiBaseUrl),
    sessionNamespace: `${account.tenantId}:${account.user.id}`,
    sessionProvider: provider,
    refreshEndpoint: '/auth/refresh',
  });
}
