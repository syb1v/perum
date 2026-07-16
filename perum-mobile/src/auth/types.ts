import type { components as CoreComponents } from '@perum/api-schema/core';
import type { components as TenantComponents } from '@perum/api-schema/tenant';

export type Discovery = CoreComponents['schemas']['TenantDiscoveryResponse'];
export type LoginRequest = TenantComponents['schemas']['LoginRequest'];
export type LoginResponse = TenantComponents['schemas']['LoginResponse'];
export type TenantUser = TenantComponents['schemas']['UserRead'];

export type TenantRole = 'student' | 'parent' | 'teacher' | 'admin' | 'school_admin' | 'director';

export type TenantAccount = {
  id: string;
  tenantId: string;
  schoolId?: string;
  tenantName: string;
  tenantHost: string;
  apiBaseUrl: string;
  descriptorRevision?: string;
  descriptorExpiresAt?: string;
  user: TenantUser;
  refreshToken: string;
};

export type Registry = {
  selectedAccountId: string | null;
  accounts: TenantAccount[];
};
