import { useNetInfo } from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { colors } from '../../src/theme';
import { formatTransactionAmount, formatTransactionDate, isTransactionsUnavailable, transactionLabel, useStudentTransactionsQuery } from '../../src/transactions/studentTransactionsCore';

export default function StudentTransactionsScreen() {
  const { account, apiClient } = useAuth();
  const network = useNetInfo();
  const eligible = Boolean(account && apiClient && account.user.role === 'student');
  const transactions = useStudentTransactionsQuery(account?.id ?? '', apiClient, eligible && network.isConnected !== false);
  if (!account || !apiClient || account.user.role !== 'student') return <FeatureUnavailable />;
  if (transactions.isError && isTransactionsUnavailable(transactions.error)) return <FeatureUnavailable />;
  const offlineWithoutCopy = network.isConnected === false && !transactions.data;
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>История ливок</Text>
    <Text style={styles.subtitle}>Последние 30 начислений и списаний</Text>
    {offlineWithoutCopy ? <View style={styles.card}><Text style={styles.cardTitle}>Нет подключения</Text><Text style={styles.muted}>История баланса не хранится на устройстве. Подключитесь к сети, чтобы загрузить её.</Text></View> : null}
    {transactions.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {transactions.isError && !transactions.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить историю ливок.</Text><Pressable onPress={() => void transactions.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {transactions.data?.length === 0 ? <View style={styles.card}><Text style={styles.cardTitle}>Операций пока нет</Text><Text style={styles.muted}>Начисления и списания появятся здесь.</Text></View> : null}
    {transactions.data?.map((transaction) => <View key={transaction.id} style={styles.card}><View style={styles.row}><View style={styles.details}><Text style={styles.cardTitle}>{transactionLabel(transaction)}</Text><Text style={styles.muted}>{formatTransactionDate(transaction.created_at)} · баланс {transaction.balance_after}</Text></View><Text style={[styles.amount, transaction.amount >= 0 ? styles.positive : styles.negative]}>{formatTransactionAmount(transaction.amount)}</Text></View></View>)}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, details: { flex: 1 }, cardTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' }, muted: { color: colors.muted, marginTop: 5, lineHeight: 20 }, amount: { fontSize: 16, fontWeight: '800', textAlign: 'right' }, positive: { color: colors.primary }, negative: { color: colors.danger }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 },
});
