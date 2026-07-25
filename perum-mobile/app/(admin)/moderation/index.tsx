import { useNetInfo } from '@react-native-community/netinfo';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { canViewSchoolModeration, formatModerationDate, mergeModerationCases, moderationCasesPath, type ModerationCasePage } from '../../../src/admin/moderationCore';
import { useAuth } from '../../../src/auth/AuthProvider';
import { useCapabilities } from '../../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../../src/components/FeatureUnavailable';
import { Screen } from '../../../src/components/Screen';
import { queryKeys } from '../../../src/query/queryKeys';
import { colors } from '../../../src/theme';

const statuses = { open: 'Открыто', dismissed: 'Отклонено', actioned: 'Обработано' };

export default function ModerationCasesScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const eligible = Boolean(account && canViewSchoolModeration(account.user.role));
  const cases = useInfiniteQuery({ queryKey: queryKeys.schoolAdminModeration(account?.id ?? ''), enabled: Boolean(eligible && apiClient && has('school_admin_social_moderation')), initialPageParam: null as number | null, queryFn: ({ pageParam }) => apiClient!.get<ModerationCasePage>(moderationCasesPath(pageParam)), getNextPageParam: (page) => page.next_cursor ?? undefined });
  if (!has('school_admin_social_moderation')) return <FeatureUnavailable />;
  if (!account || !apiClient || !canViewSchoolModeration(account.user.role)) return null;
  const items = mergeModerationCases(cases.data?.pages ?? []);
  return <Screen>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Модерация общения</Text>
    <Text style={styles.subtitle}>Содержимое сообщений доступно только внутри жалобы</Text>
    {network.isConnected === false ? <Text style={styles.offline}>{items.length ? 'Офлайн: показаны данные текущей сессии.' : 'Материалы модерации не хранятся на устройстве.'}</Text> : null}
    {cases.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {cases.isError && !items.length ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить жалобы.</Text><Pressable onPress={() => void cases.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    <FlatList data={items} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.list} onEndReached={() => { if (cases.hasNextPage && !cases.isFetchingNextPage) void cases.fetchNextPage(); }} ListEmptyComponent={!cases.isLoading && !cases.isError ? <Text style={styles.empty}>Жалоб пока нет.</Text> : null} ListFooterComponent={cases.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null} renderItem={({ item }) => <Pressable style={styles.card} onPress={() => router.push({ pathname: '/(admin)/moderation/[caseId]' as never, params: { caseId: item.id } })}><View style={styles.row}><Text style={styles.cardTitle}>Жалоба #{item.id}</Text><Text style={styles.status}>{statuses[item.status]}</Text></View><Text style={styles.muted}>{formatModerationDate(item.created_at)}</Text></Pressable>} />
  </Screen>;
}

const styles = StyleSheet.create({ back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 10 }, list: { gap: 10, paddingBottom: 30, flexGrow: 1 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, cardTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' }, status: { color: colors.primary, fontWeight: '800' }, muted: { color: colors.muted, marginTop: 7 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 }, empty: { color: colors.muted, textAlign: 'center', marginTop: 60 } });
