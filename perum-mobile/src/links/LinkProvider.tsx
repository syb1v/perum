import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { discoverTenantById } from '../auth/api';
import { parsePerumLink, targetRoute } from './core';

export function LinkProvider() {
  const { ready, account, accounts, switchAccount } = useAuth();
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const resolve = async (value: string | null) => {
      if (!value || !active) return;
      const parsed = parsePerumLink(value);
      if (!parsed) return;
      const discovery = await discoverTenantById(parsed.schoolPublicId);
      const saved = accounts.find((item) => item.tenantId === discovery.tenant_id);
      if (!saved) return router.push({ pathname: '/login', params: { host: discovery.canonical_host, target: parsed.target } });
      if (saved.id !== account?.id) await switchAccount(saved.id);
      router.replace((targetRoute(parsed.target, saved.user.role) ?? '/') as never);
    };
    void Linking.getInitialURL().then(resolve).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => { void resolve(url).catch(() => undefined); });
    return () => { active = false; subscription.remove(); };
  }, [ready, account?.id, accounts]);
  return null;
}
