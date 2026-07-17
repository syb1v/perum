import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthProvider';
import { createDescriptorLifecycleScheduler } from './trafficCore';

export function TenantDescriptorProvider() {
  const { ready, account, refreshAccountDescriptor, closeTenantTraffic } = useAuth();

  useEffect(() => {
    if (!ready || !account) return;
    const scheduler = createDescriptorLifecycleScheduler({
      expiresAt: () => {
        const value = Date.parse(account.descriptorExpiresAt ?? '');
        return Number.isFinite(value) ? value : 0;
      },
      refresh: () => refreshAccountDescriptor(account.id),
      closeTraffic: closeTenantTraffic,
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') scheduler.resume();
    });
    return () => {
      subscription.remove();
      scheduler.dispose();
    };
  }, [ready, account?.id, account?.descriptorExpiresAt]);

  return null;
}
