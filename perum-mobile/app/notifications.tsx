import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../src/auth/AuthProvider';
import { useCapabilities } from '../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../src/components/FeatureUnavailable';
import { Screen } from '../src/components/Screen';
import { notificationTarget, type NotificationItem, type NotificationList } from '../src/notifications/core';
import { queryKeys } from '../src/query/queryKeys';
import { canUseAdminSupport } from '../src/support/adminCore';
import { colors } from '../src/theme';

export default function NotificationsScreen() {
  const { account, apiClient } = useAuth(); const { has } = useCapabilities(); const queryClient = useQueryClient(); const [opening, setOpening] = useState<number | null>(null); const [error, setError] = useState<string | null>(null);
  const enabled = has('support_admin'); const eligible = canUseAdminSupport(account?.user.role, enabled);
  const query = useQuery({ queryKey: queryKeys.notifications(account?.id ?? ''), enabled: Boolean(account && apiClient && eligible), queryFn: () => apiClient!.get<NotificationList>('/user/notifications'), refetchInterval: 30_000 });
  useFocusEffect(useCallback(() => { if (eligible) void query.refetch(); }, [eligible, query.refetch]));
  if (!enabled) return <FeatureUnavailable />;
  if (!account || !apiClient || !eligible) return null;
  const items = query.data?.notifications.filter(item => !item.is_read) ?? [];
  const open = async (item: NotificationItem) => {
    if (opening !== null) return; setOpening(item.id); setError(null);
    try {
      await apiClient.post(`/user/notifications/${item.id}/read`);
      queryClient.setQueryData<NotificationList>(queryKeys.notifications(account.id), current => current ? { ...current, notifications: current.notifications.map(value => value.id === item.id ? { ...value, is_read: true } : value), unread_count: Math.max(0, current.unread_count - 1) } : current);
      const target = notificationTarget(account.user.role, enabled, item); if (target) router.push(target);
    } catch { setError('Не удалось отметить уведомление прочитанным. Повторите попытку.'); } finally { setOpening(null); }
  };
  const clear = async () => { setError(null); try { await apiClient.del('/user/notifications'); queryClient.setQueryData<NotificationList>(queryKeys.notifications(account.id), { success: true, notifications: [], unread_count: 0 }); } catch { setError('Не удалось очистить уведомления. Список сохранён.'); } };
  return <Screen>
    <View style={styles.header}><View><Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable><Text style={styles.title}>Уведомления</Text></View>{items.length ? <Pressable onPress={() => void clear()}><Text style={styles.clear}>Очистить</Text></Pressable> : null}</View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {query.isLoading && !items.length ? <ActivityIndicator color={colors.primary} /> : null}
    {query.isError && !items.length ? <Pressable style={styles.state} onPress={() => void query.refetch()}><Text style={styles.stateTitle}>Не удалось загрузить уведомления</Text><Text style={styles.retry}>Повторить</Text></Pressable> : null}
    <FlatList data={items} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list} refreshing={query.isRefetching} onRefresh={() => void query.refetch()} ListEmptyComponent={!query.isLoading && !query.isError ? <View style={styles.state}><Text style={styles.stateTitle}>Новых уведомлений нет</Text><Text style={styles.stateText}>Ответы организации появятся здесь.</Text></View> : null} renderItem={({ item }) => <Pressable disabled={opening !== null} style={styles.card} onPress={() => void open(item)}><View style={styles.dot} /><View style={styles.body}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.text}>{item.text}</Text>{item.created_at ? <Text style={styles.time}>{new Date(item.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text> : null}</View></Pressable>} />
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18 }, back: { color: colors.primary, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 29, fontWeight: '800' }, clear: { color: colors.danger, fontWeight: '700', paddingVertical: 8 }, error: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 12 }, list: { gap: 10, flexGrow: 1, paddingBottom: 30 }, card: { flexDirection: 'row', gap: 11, borderWidth: 1, borderColor: colors.primary, borderRadius: 18, backgroundColor: colors.surface, padding: 16 }, dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary, marginTop: 6 }, body: { flex: 1 }, cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' }, text: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 5 }, time: { color: colors.muted, fontSize: 11, marginTop: 8 }, state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, stateTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', textAlign: 'center' }, stateText: { color: colors.muted, textAlign: 'center', marginTop: 7 }, retry: { color: colors.primary, fontWeight: '700', marginTop: 10 },
});
