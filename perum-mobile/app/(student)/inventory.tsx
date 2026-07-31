import { useNetInfo } from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { formatInventoryDate, inventoryAccessibilityLabel, inventoryDisplayDetails, isInventoryUnavailable, useStudentInventoryQuery } from '../../src/inventory/studentInventoryCore';
import { colors } from '../../src/theme';

export default function StudentInventoryScreen() {
  const { account, apiClient } = useAuth();
  const network = useNetInfo();
  const eligible = Boolean(account && apiClient && account.user.role === 'student');
  const inventory = useStudentInventoryQuery(account?.id ?? '', apiClient, eligible && network.isConnected !== false);
  if (!account || !apiClient || account.user.role !== 'student') return <FeatureUnavailable />;
  if (inventory.isError && isInventoryUnavailable(inventory.error)) return <FeatureUnavailable />;
  const offline = network.isConnected === false;
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Вернуться назад"><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Инвентарь</Text>
    <Text style={styles.subtitle}>Последние 50 покупок</Text>
    {offline ? <View style={styles.card}><Text style={styles.cardTitle}>Нет подключения</Text><Text style={styles.muted}>{inventory.data ? 'Показаны данные, загруженные в этой сессии. Инвентарь не хранится на устройстве.' : 'Инвентарь не хранится на устройстве. Подключитесь к сети, чтобы загрузить его.'}</Text></View> : null}
    {inventory.isLoading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Загрузка инвентаря" /> : null}
    {inventory.isError && !inventory.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить инвентарь.</Text><Pressable onPress={() => void inventory.refetch()} accessibilityRole="button" accessibilityLabel="Повторить загрузку инвентаря"><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {inventory.isError && inventory.data ? <View style={styles.card}><Text style={styles.error}>Не удалось обновить инвентарь. Показаны ранее загруженные данные.</Text><Pressable onPress={() => void inventory.refetch()} accessibilityRole="button" accessibilityLabel="Повторить обновление инвентаря"><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {inventory.data?.length === 0 ? <View style={styles.card}><Text style={styles.cardTitle}>Инвентарь пуст</Text><Text style={styles.muted}>Купленные предметы появятся здесь.</Text></View> : null}
    {inventory.data?.map((item) => { const details = inventoryDisplayDetails(item); return <View key={item.id} style={styles.card} accessible accessibilityLabel={inventoryAccessibilityLabel(item)}><Text style={styles.cardTitle}>{item.name}</Text><Text style={styles.muted}>Тип: {details.itemType} · редкость: {details.rarity}</Text><Text style={styles.detail}>Количество: {item.quantity}</Text><Text style={styles.detail}>{item.equipped ? 'Экипировано' : 'Не экипировано'}</Text><Text style={styles.muted}>Куплено: {formatInventoryDate(item.purchased_at)}</Text></View>; })}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' }, muted: { color: colors.muted, marginTop: 5, lineHeight: 20 }, detail: { color: colors.ink, marginTop: 7 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 },
});
