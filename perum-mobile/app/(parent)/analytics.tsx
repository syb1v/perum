import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { selectParentChild } from '../../src/academics/parentCore';
import { formatTransactionAmount, formatTransactionDate, parentAnalyticsPath, parentSummaryPath, parentTransactionsPath, periodGrade, transactionLabel, type ParentChildren, type ParentGradesAnalytics, type ParentGradesSummary, type ParentTransactions } from '../../src/academics/parentAnalyticsCore';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';

export default function ParentAnalyticsScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const [childId, setChildId] = useState<number | null>(null);
  const enabled = Boolean(account && apiClient && account.user.role === 'parent' && has('parent_analytics'));
  const children = useQuery({ queryKey: queryKeys.parentChildren(account?.id ?? ''), enabled, queryFn: () => apiClient!.get<ParentChildren>('/parent/children') });
  useEffect(() => { setChildId((current) => selectParentChild(children.data?.children ?? [], current)); }, [children.data]);
  const loadChild = enabled && childId !== null;
  const summary = useQuery({ queryKey: queryKeys.parentSummary(account?.id ?? '', childId ?? 0), enabled: loadChild, queryFn: () => apiClient!.get<ParentGradesSummary>(parentSummaryPath(childId!)) });
  const analytics = useQuery({ queryKey: queryKeys.parentAnalytics(account?.id ?? '', childId ?? 0), enabled: loadChild, queryFn: () => apiClient!.get<ParentGradesAnalytics>(parentAnalyticsPath(childId!)) });
  const transactions = useQuery({ queryKey: queryKeys.parentTransactions(account?.id ?? '', childId ?? 0), enabled: loadChild, queryFn: () => apiClient!.get<ParentTransactions>(parentTransactionsPath(childId!)) });
  if (!has('parent_analytics')) return <FeatureUnavailable />;
  if (!account || !apiClient || account.user.role !== 'parent') return null;
  const selectedChild = children.data?.children.find((item) => item.id === childId);
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Аналитика и баланс</Text>
    {network.isConnected === false ? <Text style={styles.offline}>Офлайн: показаны последние сохранённые данные.</Text> : null}
    {children.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {children.isError && !children.data ? <ErrorCard text="Не удалось загрузить список детей." retry={() => void children.refetch()} /> : null}
    {children.data && !children.data.children.length ? <View style={styles.card}><Text style={styles.cardTitle}>Нет привязанных детей</Text><Text style={styles.muted}>Обратитесь к администратору школы.</Text></View> : null}
    {children.data?.children.length ? <View style={styles.selector}>{children.data.children.map((child) => <Pressable key={child.id} accessibilityRole="radio" accessibilityState={{ checked: child.id === childId }} onPress={() => setChildId(child.id)} style={[styles.child, child.id === childId && styles.childActive]}><Text style={[styles.childText, child.id === childId && styles.childTextActive]}>{[child.last_name, child.first_name].filter(Boolean).join(' ') || `Ученик ${child.id}`}</Text></Pressable>)}</View> : null}
    {selectedChild ? <View style={styles.stats}><Stat label="Текущий баланс" value={selectedChild.balance} /><Stat label="Оценок" value={summary.data?.total_grades ?? selectedChild.total_grades} /><Stat label="Баллов за оценки" value={summary.data?.total_points ?? '—'} /><Stat label="Средний балл" value={selectedChild.average} /></View> : null}
    {summary.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {summary.isError && !summary.data ? <ErrorCard text="Не удалось загрузить средние оценки." retry={() => void summary.refetch()} /> : null}
    {summary.data ? <Section title="Средние по предметам" empty={!summary.data.subjects.length}>{summary.data.subjects.map((item) => <Row key={item.subject_id} title={item.subject_name} value={`${item.average} · ${item.count} оценок · ${item.points} баллов`} />)}</Section> : null}
    {analytics.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {analytics.isError && !analytics.data ? <ErrorCard text="Не удалось загрузить динамику." retry={() => void analytics.refetch()} /> : null}
    {analytics.data ? <Section title="Динамика по периодам" empty={!analytics.data.subjects.length}>{analytics.data.subjects.map((subject) => <View key={subject.subject_id} style={styles.subjectBlock}><Text style={styles.rowTitle}>{subject.subject_name} · год: {subject.year_average}</Text>{analytics.data.periods.map((period) => <Row key={period.id} title={period.name} value={periodGrade(subject.periods, period.id)?.toString() ?? '—'} />)}</View>)}</Section> : null}
    {transactions.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {transactions.isError && !transactions.data ? <ErrorCard text="Не удалось загрузить операции." retry={() => void transactions.refetch()} /> : null}
    {transactions.data ? <Section title="Последние операции баланса" empty={!transactions.data.transactions.length}>{transactions.data.transactions.map((item) => <View key={item.id} style={styles.transaction}><View style={styles.transactionMain}><Text style={styles.rowTitle}>{transactionLabel(item)}</Text><Text style={styles.muted}>{formatTransactionDate(item.created_at)} · баланс {item.balance_after}</Text></View><Text style={[styles.amount, item.amount < 0 && styles.negative]}>{formatTransactionAmount(item.amount)}</Text></View>)}</Section> : null}
  </ScrollView></Screen>;
}

function Stat({ label, value }: { label: string; value: number | string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>; }
function Section({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{empty ? <Text style={styles.muted}>Данных пока нет.</Text> : children}</View>; }
function Row({ title, value }: { title: string; value: string }) { return <View style={styles.row}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowValue}>{value}</Text></View>; }
function ErrorCard({ text, retry }: { text: string; retry: () => void }) { return <View style={styles.card}><Text style={styles.error}>{text}</Text><Pressable onPress={retry}><Text style={styles.action}>Повторить</Text></Pressable></View>; }

const styles = StyleSheet.create({
  content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800', marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, selector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, child: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 10 }, childActive: { backgroundColor: colors.primary, borderColor: colors.primary }, childText: { color: colors.ink, fontWeight: '700' }, childTextActive: { color: colors.white }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }, stat: { width: '47%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14 }, statValue: { color: colors.primary, fontSize: 22, fontWeight: '800' }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginBottom: 8 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 10 }, rowTitle: { color: colors.ink, flex: 1, fontWeight: '700' }, rowValue: { color: colors.primary, fontWeight: '800', textAlign: 'right' }, subjectBlock: { marginTop: 8 }, transaction: { flexDirection: 'row', alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 10 }, transactionMain: { flex: 1 }, amount: { color: colors.primary, fontSize: 17, fontWeight: '800', marginLeft: 12 }, negative: { color: colors.danger }, muted: { color: colors.muted, marginTop: 4 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 },
});
