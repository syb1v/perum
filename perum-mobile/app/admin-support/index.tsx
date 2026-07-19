import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNetInfo } from '@react-native-community/netinfo';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { canUseAdminSupport } from '../../src/support/adminCore';
import type { AdminSupportUnread, SupportTicketPage } from '../../src/support/types';
import { colors } from '../../src/theme';

const statuses: Record<string, string> = { open: 'Открыто', in_progress: 'В работе', waiting_requester: 'Ждёт ответа', resolved: 'Решено', closed: 'Закрыто' };
const priorities: Record<string, string> = { low: 'Низкий', normal: 'Обычный', high: 'Высокий', urgent: 'Срочный' };

export default function AdminSupportInboxScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const enabled = has('support_admin');
  const eligible = canUseAdminSupport(account?.user.role, enabled);
  const tickets = useInfiniteQuery({
    queryKey: queryKeys.adminSupportTickets(account?.id ?? ''),
    enabled: Boolean(account && apiClient && eligible),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => apiClient!.get<SupportTicketPage>(`/admin/support/tickets?limit=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval: 15_000,
  });
  const unread = useQuery({
    queryKey: queryKeys.adminSupportUnread(account?.id ?? ''),
    enabled: Boolean(account && apiClient && eligible),
    queryFn: () => apiClient!.get<AdminSupportUnread>('/admin/support/unread-count'),
    refetchInterval: 15_000,
  });
  useFocusEffect(useCallback(() => {
    if (!eligible) return;
    void tickets.refetch();
    void unread.refetch();
  }, [eligible, tickets.refetch, unread.refetch]));
  if (!enabled) return <FeatureUnavailable />;
  if (!account || !eligible) return null;
  const items = tickets.data?.pages.flatMap((page) => page.items) ?? [];
  return <Screen>
    <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable><Text style={styles.title}>Очередь поддержки</Text><Text style={styles.subtitle}>Обращения пользователей вашей школы</Text></View>
    {network.isConnected === false ? <Text style={styles.offline}>Офлайн: показаны сохранённые обращения. Ответы временно недоступны.</Text> : null}
    {unread.data ? <View style={styles.summary}><View><Text style={styles.metric}>{unread.data.messages}</Text><Text style={styles.metricLabel}>непрочитано</Text></View><View><Text style={styles.metric}>{unread.data.unassigned}</Text><Text style={styles.metricLabel}>без исполнителя</Text></View><View><Text style={styles.metric}>{unread.data.urgent}</Text><Text style={styles.metricLabel}>срочных</Text></View></View> : null}
    {tickets.isError && !items.length ? <Pressable style={styles.errorCard} onPress={() => void tickets.refetch()}><Text style={styles.error}>Не удалось загрузить очередь</Text><Text style={styles.retry}>Повторить</Text></Pressable> : null}
    {tickets.isLoading && !items.length ? <ActivityIndicator color={colors.primary} /> : null}
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      onEndReached={() => { if (tickets.hasNextPage && !tickets.isFetchingNextPage) void tickets.fetchNextPage(); }}
      ListEmptyComponent={!tickets.isLoading && !tickets.isError ? <Text style={styles.empty}>Очередь пуста</Text> : null}
      ListFooterComponent={tickets.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
      refreshing={tickets.isRefetching && !tickets.isFetchingNextPage}
      onRefresh={() => { void tickets.refetch(); void unread.refetch(); }}
      renderItem={({ item }) => <Pressable style={[styles.ticket, item.priority === 'urgent' && styles.urgent]} onPress={() => router.push({ pathname: '/admin-support/[ticketId]', params: { ticketId: item.id } })}>
        <View style={styles.row}><Text numberOfLines={2} style={styles.subject}>{item.subject}</Text>{item.unread ? <Text style={styles.unread}>Новое</Text> : null}</View>
        <View style={styles.row}><Text style={styles.status}>{statuses[item.status] ?? item.status}</Text><Text style={[styles.priority, item.priority === 'urgent' && styles.urgentText]}>{priorities[item.priority] ?? item.priority}</Text></View>
        <Text style={styles.date}>{new Date(item.last_message_at ?? item.updated_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
      </Pressable>}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  header: { marginBottom: 16 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 14 }, title: { color: colors.ink, fontSize: 29, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 12 }, summary: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.primary, borderRadius: 18, padding: 16, marginBottom: 14 }, metric: { color: colors.white, fontSize: 23, fontWeight: '800' }, metricLabel: { color: colors.primarySoft, fontSize: 11, marginTop: 2 }, list: { gap: 10, paddingBottom: 30, flexGrow: 1 }, ticket: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16 }, urgent: { borderColor: colors.danger }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }, subject: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: '700' }, unread: { color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4, fontSize: 11, fontWeight: '700' }, status: { color: colors.primary, fontWeight: '700', marginTop: 12 }, priority: { color: colors.muted, marginTop: 12 }, urgentText: { color: colors.danger, fontWeight: '700' }, date: { color: colors.muted, fontSize: 12, marginTop: 9 }, empty: { color: colors.muted, textAlign: 'center', marginTop: 60 }, errorCard: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12 }, error: { color: colors.danger, fontWeight: '700' }, retry: { color: colors.primary, marginTop: 8, fontWeight: '700' },
});
