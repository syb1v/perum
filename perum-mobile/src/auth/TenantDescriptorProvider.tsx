import { useEffect } from 'react';
import { useAuth } from './AuthProvider';

export function TenantDescriptorProvider() {
  const { ready, account, refreshAccountDescriptor } = useAuth();

  useEffect(() => {
    if (!ready || !account) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        await refreshAccountDescriptor(account.id);
        if (!cancelled && expiresAt <= Date.now()) timer = setTimeout(refresh, 60_000);
      } catch {
        if (!cancelled) timer = setTimeout(refresh, 60_000);
      }
    };
    const expiresAt = account.descriptorExpiresAt ? Date.parse(account.descriptorExpiresAt) : 0;
    const delay = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now()) : 0;
    timer = setTimeout(refresh, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, account?.id, account?.descriptorExpiresAt]);

  return null;
}
