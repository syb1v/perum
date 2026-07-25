import { useNetInfo } from '@react-native-community/netinfo';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';
import { formatTeacherWorkDate, mergeTeacherWorks, nextTeacherWorksOffset, teacherWorksPath, type TeacherWork, type TeacherWorksPage } from '../../src/teacher/worksCore';

const workTypes: Record<TeacherWork['type'], string> = { homework: 'Домашнее задание', control: 'Контрольная работа' };

export default function TeacherWorksScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const enabled = Boolean(account && apiClient && account.user.role === 'teacher' && has('teacher_works'));
  const works = useInfiniteQuery({
    queryKey: queryKeys.teacherWorks(account?.id ?? ''),
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => apiClient!.get<TeacherWorksPage>(teacherWorksPath(pageParam)),
    getNextPageParam: (lastPage, pages) => nextTeacherWorksOffset(pages, lastPage),
  });
  if (!has('teacher_works')) return <FeatureUnavailable />;
  if (!account || !apiClient || account.user.role !== 'teacher') return null;
  const items = mergeTeacherWorks(works.data?.pages ?? []);
  return <Screen>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Работы учеников</Text>
    <Text style={styles.subtitle}>Домашние и контрольные работы ваших классов</Text>
    {network.isConnected === false ? <Text style={styles.offline}>Офлайн: показаны последние сохранённые работы.</Text> : null}
    {works.isLoading && !items.length ? <ActivityIndicator color={colors.primary} /> : null}
    {works.isError && !items.length ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить работы.</Text><Pressable onPress={() => void works.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      onEndReached={() => { if (works.hasNextPage && !works.isFetchingNextPage) void works.fetchNextPage(); }}
      ListEmptyComponent={!works.isLoading && !works.isError ? <Text style={styles.empty}>Работ пока нет.</Text> : null}
      ListFooterComponent={works.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
      refreshing={works.isRefetching && !works.isFetchingNextPage}
      onRefresh={() => void works.refetch()}
      renderItem={({ item }) => <View style={styles.card}>
        <View style={styles.row}><Text style={[styles.type, item.type === 'control' && styles.control]}>{workTypes[item.type]}</Text><Text style={styles.date}>{formatTeacherWorkDate(item.due_date ?? item.created_at)}</Text></View>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.meta}>{item.subject_name ?? 'Предмет не указан'} · {item.class_name ?? 'Класс не указан'}</Text>
        {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
      </View>}
    />
  </Screen>;
}

const styles = StyleSheet.create({
  back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 10 }, list: { gap: 10, paddingBottom: 30, flexGrow: 1 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, type: { color: colors.primary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }, control: { color: colors.danger }, date: { color: colors.muted, fontSize: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 9 }, meta: { color: colors.muted, marginTop: 6 }, description: { color: colors.ink, lineHeight: 20, marginTop: 10 }, action: { color: colors.primary, fontWeight: '800', marginTop: 8 }, error: { color: colors.danger }, empty: { color: colors.muted, textAlign: 'center', marginTop: 60 },
});
