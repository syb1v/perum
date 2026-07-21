import NetInfo from '@react-native-community/netinfo';
import { dehydrate, hydrate, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { queryPersistence } from './persistence';
import { PreferencesProvider } from '../preferences/PreferencesProvider';
import { MessagesProvider } from '../messages/MessagesProvider';
import { RealtimeProvider } from '../realtime/RealtimeProvider';
import { SupportProvider } from '../support/SupportProvider';
import { HomeworkProvider } from '../homework/HomeworkProvider';
import { AdminActionProvider } from '../support/AdminActionProvider';

onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)));

export function AccountQueryProvider({ children }: PropsWithChildren) {
  const { account } = useAuth();
  const [active, setActive] = useState<{ accountId: string; client: QueryClient } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!account) {
      setActive(null);
      return;
    }
    const accountId = account.id;
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });
    void (async () => {
      const cached = await queryPersistence.restore<ReturnType<typeof dehydrate>>(accountId);
      if (cached) hydrate(client, cached);
      if (cancelled) return;
      setActive({ accountId, client });
      client.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.query.state.status !== 'success' || event.query.state.fetchStatus !== 'idle') return;
        void queryPersistence.persist(accountId, dehydrate(client, { shouldDehydrateQuery: (query) => query.state.status === 'success' }));
      });
    })();
    return () => {
      cancelled = true;
      client.clear();
    };
  }, [account?.id]);

  if (!account) return children;
  if (!active || active.accountId !== account.id) return null;
  return <QueryClientProvider client={active.client}><PreferencesProvider><MessagesProvider><SupportProvider><AdminActionProvider><HomeworkProvider><RealtimeProvider>{children}</RealtimeProvider></HomeworkProvider></AdminActionProvider></SupportProvider></MessagesProvider></PreferencesProvider></QueryClientProvider>;
}
