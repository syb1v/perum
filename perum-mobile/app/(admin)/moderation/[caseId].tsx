import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { canViewSchoolModeration, createModerationActionAttempt, formatModerationDate, isModerationConflict, matchesModerationActionAttempt, MODERATION_ACTIONS, MODERATION_REASON_MAX_LENGTH, moderationActionPath, moderationCasePath, moderationInvalidationTargets, moderationReasonError, type ModerationAction, type ModerationActionPayload, type ModerationCaseDetail } from '../../../src/admin/moderationCore';
import { useAuth } from '../../../src/auth/AuthProvider';
import { useCapabilities } from '../../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../../src/components/FeatureUnavailable';
import { Screen } from '../../../src/components/Screen';
import { queryKeys } from '../../../src/query/queryKeys';
import { colors } from '../../../src/theme';

const actionLabels: Record<ModerationAction, string> = {
  dismiss: 'Отклонить жалобу',
  hide_reported_message: 'Скрыть сообщение',
  lock_conversation: 'Заблокировать переписку',
  unlock_conversation: 'Разблокировать переписку',
};

export default function ModerationCaseScreen() {
  const { caseId: rawCaseId } = useLocalSearchParams<{ caseId: string }>();
  const caseId = Number(rawCaseId);
  const path = moderationCasePath(caseId);
  const actionPath = moderationActionPath(caseId);
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const queryClient = useQueryClient();
  const submittingRef = useRef(false);
  const pendingAttemptRef = useRef<ReturnType<typeof createModerationActionAttempt> | null>(null);
  const [action, setAction] = useState<ModerationAction>('dismiss');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'conflict' | 'error'>('idle');
  const eligible = Boolean(account && canViewSchoolModeration(account.user.role));
  const detail = useQuery({ queryKey: queryKeys.schoolAdminModerationCase(account?.id ?? '', Number.isInteger(caseId) ? caseId : 0), enabled: Boolean(eligible && apiClient && path && has('school_admin_social_moderation')), queryFn: () => apiClient!.get<ModerationCaseDetail>(path!) });
  if (!has('school_admin_social_moderation')) return <FeatureUnavailable />;
  if (!account || !apiClient || !canViewSchoolModeration(account.user.role) || !path || !actionPath) return null;
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const reasonError = moderationReasonError(reason);
  const submit = async () => {
    if (!detail.data || offline || reasonError || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitState('idle');
    const attempt = pendingAttemptRef.current && matchesModerationActionAttempt(pendingAttemptRef.current, action, reason)
      ? pendingAttemptRef.current
      : createModerationActionAttempt(action, reason, detail.data.version);
    pendingAttemptRef.current = attempt;
    try {
      await apiClient.post<unknown>(actionPath, attempt.payload satisfies ModerationActionPayload);
      pendingAttemptRef.current = null;
      setReason('');
      setSubmitState('success');
      await detail.refetch();
      await Promise.all(moderationInvalidationTargets(account.id, caseId).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    } catch (error) {
      if (isModerationConflict(error)) {
        pendingAttemptRef.current = null;
        setSubmitState('conflict');
        await detail.refetch();
      } else {
        setSubmitState('error');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  return <Screen><KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable>
    <Text style={styles.title}>Жалоба #{caseId}</Text>
    {network.isConnected === false ? <Text style={styles.offline}>{detail.data ? 'Офлайн: показаны данные текущей сессии.' : 'Материалы жалобы не хранятся на устройстве.'}</Text> : null}
    {detail.isError && !detail.data ? <View style={styles.card}><Text style={styles.error}>Не удалось загрузить жалобу.</Text><Pressable onPress={() => void detail.refetch()}><Text style={styles.action}>Повторить</Text></Pressable></View> : null}
    {detail.data ? <><View style={styles.card}><Text style={styles.cardTitle}>{detail.data.category}</Text><Text style={styles.status}>Статус: {detail.data.status}</Text><Text style={styles.muted}>Участник: {detail.data.other_participant}</Text><Text style={styles.muted}>{formatModerationDate(detail.data.created_at)}</Text>{detail.data.comment ? <Text style={styles.comment}>Комментарий: {detail.data.comment}</Text> : null}</View><View style={styles.card}><Text style={styles.cardTitle}>Материалы жалобы</Text>{detail.data.evidence.length ? detail.data.evidence.map((item) => <View key={item.message_id} style={styles.evidence}><Text style={styles.muted}>{formatModerationDate(item.created_at)}</Text><Text style={styles.body}>{item.body ?? 'Сообщение недоступно'}</Text></View>) : <Text style={styles.muted}>Материалы отсутствуют.</Text>}</View><View style={styles.card}><Text style={styles.cardTitle}>Действие модератора</Text><Text style={styles.label}>Выберите действие</Text><View style={styles.actions}>{MODERATION_ACTIONS.map((value) => <Pressable key={value} accessibilityLabel={actionLabels[value]} accessibilityRole="radio" accessibilityState={{ checked: action === value, disabled: offline || submitting }} disabled={offline || submitting} style={[styles.choice, action === value && styles.choiceActive, (offline || submitting) && styles.disabled]} onPress={() => { setAction(value); setSubmitState('idle'); }}><Text style={[styles.choiceText, action === value && styles.choiceTextActive]}>{actionLabels[value]}</Text></Pressable>)}</View><Text style={styles.label}>Причина</Text><TextInput accessibilityLabel="Причина действия модератора" editable={!offline && !submitting} maxLength={MODERATION_REASON_MAX_LENGTH} multiline onChangeText={(value) => { setReason(value); setSubmitState('idle'); }} placeholder="Опишите основание решения" placeholderTextColor={colors.muted} style={[styles.input, (offline || submitting) && styles.disabled]} textAlignVertical="top" value={reason} />{reason.length > 0 && reasonError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{reasonError}</Text> : null}{offline ? <Text accessibilityLiveRegion="polite" style={styles.error}>Действия доступны только онлайн и не сохраняются на устройстве.</Text> : null}{submitState === 'conflict' ? <Text accessibilityLiveRegion="assertive" style={styles.error}>Состояние жалобы изменилось на сервере. Данные обновлены, проверьте их и повторите действие при необходимости.</Text> : null}{submitState === 'error' ? <Text accessibilityLiveRegion="assertive" style={styles.error}>Не удалось выполнить действие. Выбор и причина сохранены на экране.</Text> : null}{submitState === 'success' ? <Text accessibilityLiveRegion="polite" style={styles.success}>Действие подтверждено сервером.</Text> : null}<Pressable accessibilityLabel={`Выполнить действие: ${actionLabels[action]}`} accessibilityRole="button" accessibilityState={{ disabled: offline || submitting || Boolean(reasonError) }} disabled={offline || submitting || Boolean(reasonError)} style={[styles.submit, (offline || submitting || Boolean(reasonError)) && styles.disabled]} onPress={() => void submit()}><Text style={styles.submitText}>{submitting ? 'Выполняется…' : 'Подтвердить действие'}</Text></Pressable></View></> : null}
  </ScrollView></KeyboardAvoidingView></Screen>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 12 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800' }, offline: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginTop: 12 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' }, status: { color: colors.primary, fontWeight: '700', marginTop: 8 }, muted: { color: colors.muted, marginTop: 7 }, comment: { color: colors.ink, marginTop: 12, lineHeight: 21 }, evidence: { borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 12 }, body: { color: colors.ink, marginTop: 7, lineHeight: 21 }, label: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 16 }, actions: { gap: 8 }, choice: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 }, choiceActive: { backgroundColor: colors.primary, borderColor: colors.primary }, choiceText: { color: colors.ink, fontWeight: '700' }, choiceTextActive: { color: colors.white }, input: { borderColor: colors.border, borderWidth: 1, borderRadius: 12, color: colors.ink, minHeight: 96, padding: 12 }, error: { color: colors.danger, lineHeight: 19, marginTop: 10 }, success: { color: colors.primary, fontWeight: '700', marginTop: 10 }, submit: { backgroundColor: colors.primary, borderRadius: 12, marginTop: 14, padding: 12 }, submitText: { color: colors.white, fontWeight: '800', textAlign: 'center' }, disabled: { opacity: 0.45 }, action: { color: colors.primary, fontWeight: '800', marginTop: 10 } });
