import { useNetInfo } from '@react-native-community/netinfo';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';
import { formatTeacherWorkDate, isTeacherWorksPickerUnavailable, mergeTeacherWorks, nextTeacherWorksOffset, normalizeTeacherWorksFilter, selectedTeacherWork, shouldRetryTeacherWorksPicker, sortedTeacherWorksClasses, teacherWorksPath, type TeacherWork, type TeacherWorksPage, type TeacherWorksPicker } from '../../src/teacher/worksCore';

const workTypes: Record<TeacherWork['type'], string> = { homework: 'Домашнее задание', control: 'Контрольная работа' };

export default function TeacherWorksScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const [classId, setClassId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null);
  const enabled = Boolean(account && apiClient && account.user.role === 'teacher' && has('teacher_works'));
  const picker = useQuery({
    queryKey: queryKeys.teacherAnalyticsPicker(account?.id ?? ''),
    enabled,
    queryFn: () => apiClient!.get<TeacherWorksPicker>('/journal/teacher/subjects'),
    retry: shouldRetryTeacherWorksPicker,
  });
  const filtersUnavailable = picker.isError && isTeacherWorksPickerUnavailable(picker.error);
  const pickerData = filtersUnavailable ? undefined : picker.data;
  const classes = sortedTeacherWorksClasses(pickerData);
  const normalizedFilter = normalizeTeacherWorksFilter(classes, { classId, subjectId });
  const selectedClass = classes.find((item) => item.id === normalizedFilter.classId);
  useEffect(() => {
    if (!pickerData && !filtersUnavailable) return;
    setClassId(normalizedFilter.classId);
    setSubjectId(normalizedFilter.subjectId);
  }, [pickerData, filtersUnavailable, normalizedFilter.classId, normalizedFilter.subjectId]);
  const works = useInfiniteQuery({
    queryKey: queryKeys.teacherWorks(account?.id ?? '', normalizedFilter.classId, normalizedFilter.subjectId),
    enabled,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => apiClient!.get<TeacherWorksPage>(teacherWorksPath(pageParam, normalizedFilter)),
    getNextPageParam: (lastPage, pages) => nextTeacherWorksOffset(pages, lastPage),
  });
  if (!has('teacher_works')) return <FeatureUnavailable />;
  if (!account || !apiClient || account.user.role !== 'teacher') return null;
  const items = mergeTeacherWorks(works.data?.pages ?? []);
  const selectedWork = selectedTeacherWork(items, selectedWorkId);
  return <Screen>
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      onEndReached={() => { if (works.hasNextPage && !works.isFetchingNextPage && !works.isFetchNextPageError) void works.fetchNextPage(); }}
      ListHeaderComponent={<View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
        <Text accessibilityRole="header" style={styles.title}>Работы учеников</Text>
        <Text style={styles.subtitle}>Домашние и контрольные работы ваших классов</Text>
        {network.isConnected === false ? <Text style={styles.offline}>Офлайн: показаны последние сохранённые работы.</Text> : null}
        {!filtersUnavailable && picker.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {!filtersUnavailable && picker.isError ? <View style={styles.filterNotice}><Text style={styles.filterNoticeText}>Фильтры временно недоступны.</Text><Pressable accessibilityRole="button" onPress={() => void picker.refetch()}><Text style={styles.actionInline}>Повторить</Text></Pressable></View> : null}
        {!filtersUnavailable && pickerData && classes.length ? <View style={styles.filters}>
          <Selector title="Класс" items={[{ id: null, label: 'Все классы' }, ...classes.map((item) => ({ id: item.id, label: item.name }))]} selected={normalizedFilter.classId} onSelect={(value) => { setClassId(value); setSubjectId(null); setSelectedWorkId(null); }} />
          {selectedClass ? <Selector title="Предмет" items={[{ id: null, label: 'Все предметы' }, ...selectedClass.subjects.map((item) => ({ id: item.id, label: item.short_name ?? item.name }))]} selected={normalizedFilter.subjectId} onSelect={(value) => { setSubjectId(value); setSelectedWorkId(null); }} /> : null}
        </View> : null}
        {selectedWork ? <WorkDetail work={selectedWork} close={() => setSelectedWorkId(null)} /> : null}
        {works.isLoading && !items.length ? <ActivityIndicator color={colors.primary} /> : null}
        {works.isError && !items.length ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить работы.</Text><Pressable accessibilityRole="button" onPress={() => void works.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
      </View>}
      ListEmptyComponent={!works.isLoading && !works.isError ? <Text style={styles.empty}>Работ пока нет.</Text> : null}
      ListFooterComponent={works.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : works.isFetchNextPageError ? <View style={styles.pageError}><Text style={styles.error}>Не удалось загрузить следующие работы.</Text><Pressable accessibilityRole="button" onPress={() => void works.fetchNextPage()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
      refreshing={works.isRefetching && !works.isFetchingNextPage}
      onRefresh={() => void works.refetch()}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Открыть работу: ${item.title}`} onPress={() => setSelectedWorkId(item.id)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.row}><Text style={[styles.type, item.type === 'control' && styles.control]}>{workTypes[item.type]}</Text><Text style={styles.date}>{formatTeacherWorkDate(item.due_date ?? item.created_at)}</Text></View>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.meta}>{item.subject_name ?? 'Предмет не указан'} · {item.class_name ?? 'Класс не указан'}</Text>
        {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
      </Pressable>}
    />
  </Screen>;
}

function Selector({ title, items, selected, onSelect }: { title: string; items: { id: number | null; label: string }[]; selected: number | null; onSelect: (value: number | null) => void }) {
  return <View style={styles.filterGroup} accessibilityRole="radiogroup"><Text style={styles.filterTitle}>{title}</Text><View style={styles.chips}>{items.map((item) => <Pressable key={`${title}-${item.id ?? 'all'}`} accessibilityRole="radio" accessibilityState={{ checked: selected === item.id }} style={[styles.chip, selected === item.id && styles.chipActive]} onPress={() => onSelect(item.id)}><Text style={[styles.chipText, selected === item.id && styles.chipTextActive]}>{item.label}</Text></Pressable>)}</View></View>;
}

function WorkDetail({ work, close }: { work: TeacherWork; close: () => void }) {
  return <View style={styles.detail} accessibilityLiveRegion="polite">
    <View style={styles.detailHeader}><Text accessibilityRole="header" style={styles.detailHeading}>Детали работы</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть детали работы" onPress={close}><Text style={styles.actionInline}>Закрыть</Text></Pressable></View>
    <Text style={styles.cardTitle}>{work.title}</Text>
    <DetailRow label="Тип" value={workTypes[work.type]} />
    <DetailRow label="Класс" value={work.class_name ?? 'Класс не указан'} />
    <DetailRow label="Предмет" value={work.subject_name ?? 'Предмет не указан'} />
    <DetailRow label="Описание" value={work.description?.trim() || 'Описание не указано'} />
    <DetailRow label="Срок" value={formatTeacherWorkDate(work.due_date)} />
    <DetailRow label="Создано" value={formatTeacherWorkDate(work.created_at)} />
  </View>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  header: { gap: 0 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 10 }, filters: { marginBottom: 12, gap: 10 }, filterGroup: { gap: 7 }, filterTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { maxWidth: '100%', borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.surface }, chipActive: { backgroundColor: colors.primary, borderColor: colors.primary }, chipText: { color: colors.ink, fontWeight: '700', flexShrink: 1 }, chipTextActive: { color: colors.white }, filterNotice: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 }, filterNoticeText: { color: colors.muted, fontSize: 13 }, actionInline: { color: colors.primary, fontWeight: '800' }, list: { gap: 10, paddingBottom: 30, flexGrow: 1 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16 }, cardPressed: { opacity: 0.75 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }, type: { color: colors.primary, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' }, control: { color: colors.danger }, date: { color: colors.muted, fontSize: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginTop: 9 }, meta: { color: colors.muted, marginTop: 6 }, description: { color: colors.ink, lineHeight: 20, marginTop: 10 }, detail: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12 }, detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }, detailHeading: { color: colors.ink, fontSize: 20, fontWeight: '800' }, detailRow: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10, marginTop: 10 }, detailLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }, detailValue: { color: colors.ink, lineHeight: 20, marginTop: 3 }, pageError: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14 }, action: { color: colors.primary, fontWeight: '800', marginTop: 8 }, error: { color: colors.danger }, empty: { color: colors.muted, textAlign: 'center', marginTop: 60 },
});
