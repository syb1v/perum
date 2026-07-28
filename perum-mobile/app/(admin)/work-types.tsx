import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { workTypesPath, workTypeWeightLabel, type JournalWorkTypes } from '../../src/admin/workTypesCore';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';

export default function WorkTypesScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const eligible = Boolean(account && (account.user.role === 'school_admin' || account.user.role === 'director'));
  const workTypes = useQuery({ queryKey: queryKeys.schoolAdminWorkTypes(account?.id ?? ''), enabled: Boolean(eligible && apiClient && has('school_admin_work_types')), queryFn: () => apiClient!.get<JournalWorkTypes>(workTypesPath()) });
  if (!has('school_admin_work_types')) return <FeatureUnavailable />;
  if (!account || !apiClient || !eligible) return null;
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Виды работ</Text>
    <Text style={styles.subtitle}>Справочник видов учебных работ и их весов</Text>
    {network.isConnected === false ? <Text style={styles.offline}>{workTypes.data ? 'Офлайн: показаны данные текущей сессии.' : 'Виды работ не хранятся на устройстве.'}</Text> : null}
    {workTypes.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
    {workTypes.isError && !workTypes.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить виды работ.</Text><Pressable onPress={() => void workTypes.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {workTypes.data && !workTypes.data.work_types.length ? <Text style={styles.empty}>Виды работ пока не настроены.</Text> : null}
    {workTypes.data?.work_types.map((workType) => <View key={workType.id} style={styles.card}><Text style={styles.cardTitle}>{workType.name}</Text><Text style={styles.weight}>{workTypeWeightLabel(workType)}</Text></View>)}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 5, marginBottom: 14 }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' }, weight: { color: colors.primary, fontWeight: '800', marginTop: 8 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 }, empty: { color: colors.muted, marginTop: 16 } });
