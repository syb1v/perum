import { useInfiniteQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useAuth } from '../../src/auth/AuthProvider';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';
import type { SupportTicketPage } from '../../src/support/types';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { useSupportSync } from '../../src/support/SupportProvider';

const statuses: Record<string, string> = { open: 'Открыто', in_progress: 'В работе', waiting_requester: 'Ждёт вашего ответа', resolved: 'Решено', closed: 'Закрыто' };
const categories: Record<string, string> = { general: 'Общий вопрос', technical: 'Техническая проблема', account: 'Учётная запись', academic: 'Учебный процесс', safety: 'Безопасность', other: 'Другое' };

export default function SupportTicketsScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const enabled = has('support_requester');
  const network = useNetInfo();
  const sync = useSupportSync();
  const eligible = account?.user.role === 'student' || account?.user.role === 'parent' || account?.user.role === 'teacher';
  const tickets = useInfiniteQuery({
    queryKey: queryKeys.supportTickets(account?.id ?? ''),
    enabled: Boolean(enabled && account && apiClient && eligible),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => apiClient!.get<SupportTicketPage>(`/support/tickets?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchInterval: 15_000,
  });
  useFocusEffect(useCallback(() => { if (enabled && eligible) void tickets.refetch(); }, [enabled, eligible, tickets.refetch]));
  const serverItems = tickets.data?.pages.flatMap((page) => page.items) ?? [];
  const serverIds = new Set(serverItems.map((item) => item.id));
  const localItems = sync.pendingTickets.filter((item) => !item.serverTicketId || !serverIds.has(item.serverTicketId));
  const items = [...localItems, ...serverItems];
  useEffect(() => {
    for (const item of sync.pendingTickets) if (item.serverTicketId && serverIds.has(item.serverTicketId)) void sync.dismissTicket(item.id);
  }, [serverItems.map((item) => item.id).join(','), sync.pendingTickets.map((item) => `${item.id}:${item.serverTicketId}`).join(',')]);
  if (!enabled) return <FeatureUnavailable />;
  if (!account || !eligible) return null;
  return <Screen>
    <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable><Text style={styles.title}>Поддержка школы</Text><Text style={styles.subtitle}>Обращения обрабатывает ваша школа</Text></View>
    {network.isConnected === false ? <Text style={styles.offline}>Нет подключения. Сохранённые обращения доступны{has('offline_support_ticket_creation') ? ', новые отправятся автоматически.' : ', создание временно недоступно.'}</Text> : null}
    {has('offline_support_ticket_creation') ? <Pressable style={styles.create} onPress={() => router.push('/support/create')}><Text style={styles.createText}>Новое обращение</Text></Pressable> : network.isConnected === true ? <Pressable style={styles.create} onPress={() => router.push('/support/create')}><Text style={styles.createText}>Новое обращение</Text></Pressable> : <Text style={styles.offline}>Создание обращения офлайн недоступно.</Text>}
    {tickets.isLoading && !items.length ? <ActivityIndicator color={colors.primary} /> : null}
    <FlatList
      data={items}
      keyExtractor={(item) => 'clientTicketId' in item ? `local-${item.id}` : item.id}
      contentContainerStyle={styles.list}
      onEndReached={() => { if (tickets.hasNextPage && !tickets.isFetchingNextPage) void tickets.fetchNextPage(); }}
      ListEmptyComponent={!tickets.isLoading ? <Text style={styles.empty}>У вас пока нет обращений</Text> : null}
      ListFooterComponent={tickets.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
      refreshing={tickets.isRefetching && !tickets.isFetchingNextPage}
      onRefresh={() => void tickets.refetch()}
      renderItem={({ item }) => { const local = 'clientTicketId' in item; const routeId = local ? item.serverTicketId ?? item.id : item.id; return <Pressable style={styles.ticket} onPress={() => router.push({ pathname: '/support/[ticketId]', params: { ticketId: routeId } })}>
        <View style={styles.ticketTitle}><Text numberOfLines={2} style={styles.subject}>{item.subject}</Text>{!local && item.unread ? <View style={styles.unread}><Text style={styles.unreadText}>Новое</Text></View> : null}</View>
        <Text style={styles.category}>{categories[item.category] ?? item.category}</Text>
        <View style={styles.footer}><Text style={[styles.status, local && item.state === 'failed_permanent' && styles.failed]}>{local ? item.state === 'failed_permanent' ? 'Не отправлено' : item.state === 'reconciled' ? 'Создано' : 'Ожидает отправки' : statuses[item.status] ?? item.status}</Text><Text style={styles.date}>{new Date(local ? item.createdAt : item.last_message_at ?? item.updated_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text></View>
      </Pressable>; }}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  header: { marginBottom: 18 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 14 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 10 }, create: { backgroundColor: colors.primary, borderRadius: 16, padding: 15, alignItems: 'center', marginBottom: 16 }, disabled: { opacity: 0.45 }, createText: { color: colors.white, fontWeight: '700', fontSize: 16 }, list: { gap: 10, paddingBottom: 30, flexGrow: 1 }, ticket: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16 }, ticketTitle: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, subject: { flex: 1, color: colors.ink, fontWeight: '700', fontSize: 17 }, unread: { backgroundColor: colors.primarySoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }, unreadText: { color: colors.primary, fontWeight: '700', fontSize: 11 }, category: { color: colors.muted, marginTop: 7 }, footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }, status: { color: colors.primary, fontWeight: '700', fontSize: 13 }, failed: { color: colors.danger }, date: { color: colors.muted, fontSize: 12 }, empty: { color: colors.muted, textAlign: 'center', marginTop: 60 },
});
