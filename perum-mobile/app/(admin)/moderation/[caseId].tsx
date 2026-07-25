import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { canViewSchoolModeration, formatModerationDate, moderationCasePath, type ModerationCaseDetail } from '../../../src/admin/moderationCore';
import { useAuth } from '../../../src/auth/AuthProvider';
import { useCapabilities } from '../../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../../src/components/FeatureUnavailable';
import { Screen } from '../../../src/components/Screen';
import { queryKeys } from '../../../src/query/queryKeys';
import { colors } from '../../../src/theme';

export default function ModerationCaseScreen() {
  const { caseId: rawCaseId } = useLocalSearchParams<{ caseId: string }>();
  const caseId = Number(rawCaseId);
  const path = moderationCasePath(caseId);
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const eligible = Boolean(account && canViewSchoolModeration(account.user.role));
  const detail = useQuery({ queryKey: queryKeys.schoolAdminModerationCase(account?.id ?? '', Number.isInteger(caseId) ? caseId : 0), enabled: Boolean(eligible && apiClient && path && has('school_admin_social_moderation')), queryFn: () => apiClient!.get<ModerationCaseDetail>(path!) });
  if (!has('school_admin_social_moderation')) return <FeatureUnavailable />;
  if (!account || !apiClient || !canViewSchoolModeration(account.user.role) || !path) return null;
  return <Screen><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Жалоба #{caseId}</Text>
    {network.isConnected === false ? <Text style={styles.offline}>{detail.data ? 'Офлайн: показаны данные текущей сессии.' : 'Материалы жалобы не хранятся на устройстве.'}</Text> : null}
    {detail.isError && !detail.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить жалобу.</Text><Pressable onPress={() => void detail.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {detail.data ? <><View style={styles.card}><Text style={styles.cardTitle}>{detail.data.category}</Text><Text style={styles.muted}>Участник: {detail.data.other_participant}</Text><Text style={styles.muted}>{formatModerationDate(detail.data.created_at)}</Text>{detail.data.comment ? <Text style={styles.comment}>Комментарий: {detail.data.comment}</Text> : null}</View><View style={styles.card}><Text style={styles.cardTitle}>Материалы жалобы</Text>{detail.data.evidence.length ? detail.data.evidence.map((item) => <View key={item.message_id} style={styles.evidence}><Text style={styles.muted}>{formatModerationDate(item.created_at)}</Text><Text style={styles.body}>{item.body ?? 'Сообщение недоступно'}</Text></View>) : <Text style={styles.muted}>Материалы отсутствуют.</Text>}</View></> : null}
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({ content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginTop: 12 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' }, muted: { color: colors.muted, marginTop: 7 }, comment: { color: colors.ink, marginTop: 12, lineHeight: 21 }, evidence: { borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 12 }, body: { color: colors.ink, marginTop: 7, lineHeight: 21 }, error: { color: colors.danger }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 } });
