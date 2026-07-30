import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { buildPeriodCharts, buildSubjectAverageChart, type GradeChartValue } from '../../src/academics/parentAnalyticsCharts';
import { selectParentChild } from '../../src/academics/parentCore';
import { formatTransactionAmount, formatTransactionDate, parentAnalyticsPath, parentSummaryPath, parentTransactionsPath, transactionLabel, type ParentChildren, type ParentGradesAnalytics, type ParentGradesSummary, type ParentTransactions } from '../../src/academics/parentAnalyticsCore';
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
  const childName = selectedChild ? [selectedChild.last_name, selectedChild.first_name].filter(Boolean).join(' ') || `Ученик ${selectedChild.id}` : 'Ученик';
  const subjectChart = summary.data ? buildSubjectAverageChart(summary.data, childName) : [];
  const periodCharts = analytics.data ? buildPeriodCharts(analytics.data, childName) : [];
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
    {summary.data ? <Section title="Средние по предметам" empty={!subjectChart.length}><Text style={styles.scaleLabel}>Шкала оценок: от 1 до 5.</Text>{subjectChart.map((item) => <View key={item.subjectId} accessible accessibilityLabel={item.accessibilityLabel} style={styles.chartItem}><View style={styles.chartHeading}><Text style={styles.rowTitle}>{item.subjectName}</Text><Text style={styles.chartValue}>{item.valueText}</Text></View><GradeBar grade={item} /><Text style={styles.muted}>{item.detailText}</Text></View>)}</Section> : null}
    {analytics.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {analytics.isError && !analytics.data ? <ErrorCard text="Не удалось загрузить динамику." retry={() => void analytics.refetch()} /> : null}
    {analytics.data ? <Section title="Динамика по периодам" empty={!periodCharts.length}><Text style={styles.scaleLabel}>Шкала оценок: от 1 до 5.</Text>{periodCharts.map((subject) => <View key={subject.subjectId} style={styles.subjectBlock}><Text style={styles.rowTitle}>{subject.subjectName} · год: {subject.yearValueText}</Text>{subject.periods.length ? <ScrollView horizontal nestedScrollEnabled contentContainerStyle={styles.periods} showsHorizontalScrollIndicator>{subject.periods.map((period) => <View key={period.periodId} accessible accessibilityLabel={period.accessibilityLabel} style={styles.periodCell}><Text style={styles.periodName}>{period.periodName}</Text><Text style={styles.chartValue}>{period.valueText}</Text><GradeBar grade={period} /></View>)}</ScrollView> : <Text style={styles.muted}>Периоды пока не настроены.</Text>}</View>)}</Section> : null}
    {transactions.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {transactions.isError && !transactions.data ? <ErrorCard text="Не удалось загрузить операции." retry={() => void transactions.refetch()} /> : null}
    {transactions.data ? <Section title="Последние операции баланса" empty={!transactions.data.transactions.length}>{transactions.data.transactions.map((item) => <View key={item.id} style={styles.transaction}><View style={styles.transactionMain}><Text style={styles.rowTitle}>{transactionLabel(item)}</Text><Text style={styles.muted}>{formatTransactionDate(item.created_at)} · баланс {item.balance_after}</Text></View><Text style={[styles.amount, item.amount < 0 && styles.negative]}>{formatTransactionAmount(item.amount)}</Text></View>)}</Section> : null}
  </ScrollView></Screen>;
}

function Stat({ label, value }: { label: string; value: number | string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>; }
function Section({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{empty ? <Text style={styles.muted}>Данных пока нет.</Text> : children}</View>; }
function GradeBar({ grade }: { grade: GradeChartValue }) { return <View style={styles.barTrack}><View style={[styles.barFill, { width: `${grade.percent}%` }]} />{grade.value === null ? <View style={styles.missingMark}><Text style={styles.missingMarkText}>×</Text></View> : null}</View>; }
function ErrorCard({ text, retry }: { text: string; retry: () => void }) { return <View style={styles.card}><Text style={styles.error}>{text}</Text><Pressable onPress={retry}><Text style={styles.action}>Повторить</Text></Pressable></View>; }

const styles = StyleSheet.create({
  content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800', marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, selector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, child: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 10 }, childActive: { backgroundColor: colors.primary, borderColor: colors.primary }, childText: { color: colors.ink, fontWeight: '700' }, childTextActive: { color: colors.white }, stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }, stat: { width: '47%', minWidth: 130, flexGrow: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14 }, statValue: { color: colors.primary, fontSize: 22, fontWeight: '800' }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', marginBottom: 8 }, rowTitle: { color: colors.ink, flex: 1, fontWeight: '700' }, chartItem: { borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 12 }, chartHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, chartValue: { color: colors.primary, fontSize: 17, fontWeight: '800' }, scaleLabel: { color: colors.muted, marginBottom: 4 }, barTrack: { height: 12, backgroundColor: colors.primarySoft, borderColor: colors.ink, borderWidth: 1, borderRadius: 6, marginTop: 8, overflow: 'hidden' }, barFill: { height: '100%', backgroundColor: colors.primary, borderRightColor: colors.ink, borderRightWidth: 2 }, missingMark: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 }, missingMarkText: { color: colors.ink, fontSize: 12, fontWeight: '800', lineHeight: 12 }, subjectBlock: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 8, paddingTop: 12 }, periods: { alignItems: 'stretch', gap: 10, paddingBottom: 8, paddingTop: 8 }, periodCell: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 12, minWidth: 136, padding: 10 }, periodName: { color: colors.ink, fontWeight: '700', minHeight: 36 }, transaction: { flexDirection: 'row', alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 10 }, transactionMain: { flex: 1 }, amount: { color: colors.primary, fontSize: 17, fontWeight: '800', marginLeft: 12 }, negative: { color: colors.danger }, muted: { color: colors.muted, marginTop: 4 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 },
});
