import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { discoverTenantById } from '../auth/api';
import { parsePerumLink, targetRoute } from './core';
import { runtimeConfig } from '../config/runtime';
import { createConsumeOnceCoordinator } from './coordinatorCore';
import { registerNavigationIntentHandler, submitNavigationIntent } from './intentCoordinator';

export function LinkProvider() {
  const { ready, account, accounts, switchAccount } = useAuth();
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const resolve = async (value: string) => {
      if (!value || !active) return;
      const parsed = parsePerumLink(value, runtimeConfig.linkHost);
      if (!parsed) return;
      const discovery = await discoverTenantById(parsed.schoolPublicId);
      const saved = accounts.find((item) => item.tenantId === discovery.tenant_id);
      if (!saved) return router.push({ pathname: '/login', params: { host: discovery.canonical_host, target: parsed.target } });
      if (saved.id !== account?.id) await switchAccount(saved.id);
      router.replace((targetRoute(parsed.target, saved.user.role) ?? '/') as never);
    };
    const coordinator = createConsumeOnceCoordinator(resolve);
    const unregister = registerNavigationIntentHandler((value, identity) => coordinator.submit(value, identity));
    void Linking.getInitialURL().then((value) => submitNavigationIntent(value, value ? `link:initial:${value}` : undefined)).catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => submitNavigationIntent(url));
    return () => { active = false; unregister(); subscription.remove(); };
  }, [ready, account?.id, accounts]);
  return null;
}
