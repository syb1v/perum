import { useNetInfo } from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { Screen } from '../../src/components/Screen';
import { queryKeys } from '../../src/query/queryKeys';
import { colors } from '../../src/theme';
import type { SupportCategory, SupportTicketCreateOut } from '../../src/support/types';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { useSupportSync } from '../../src/support/SupportProvider';

const categories: { value: SupportCategory; label: string }[] = [{ value: 'general', label: 'Общий вопрос' }, { value: 'technical', label: 'Техническая проблема' }, { value: 'account', label: 'Учётная запись' }, { value: 'academic', label: 'Учебный процесс' }, { value: 'safety', label: 'Безопасность' }, { value: 'other', label: 'Другое' }];
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
export default function CreateSupportTicketScreen() {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const enabled = has('support_requester');
  const network = useNetInfo();
  const queryClient = useQueryClient();
  const sync = useSupportSync();
  const [category, setCategory] = useState<SupportCategory>('general');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const eligible = account?.user.role === 'student' || account?.user.role === 'parent' || account?.user.role === 'teacher';
  if (!enabled) return <FeatureUnavailable />;
  if (!account || !apiClient || !eligible) return null;
  const submit = async () => {
    if (!enabled || submitting || subject.trim().length < 2 || !body.trim()) return;
    setSubmitting(true); setError('');
    try {
      if (has('offline_support_ticket_creation')) {
        const result = await sync.createTicket(category, subject.trim(), body.trim());
        if (!result) throw new Error('offline creation unavailable');
        router.replace({ pathname: '/support/[ticketId]', params: { ticketId: result.id } });
      } else {
        if (network.isConnected !== true) throw new Error('network unavailable');
        const result = await apiClient.post<SupportTicketCreateOut>('/support/tickets', { client_ticket_id: makeId(), client_message_id: makeId(), category, subject: subject.trim(), body: body.trim() });
        await queryClient.invalidateQueries({ queryKey: queryKeys.supportTickets(account.id) });
        router.replace({ pathname: '/support/[ticketId]', params: { ticketId: result.ticket.id } });
      }
    } catch {
      setError('Не удалось создать обращение. Проверьте подключение и повторите попытку.');
    } finally { setSubmitting(false); }
  };
  return <Screen><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable><Text style={styles.title}>Новое обращение</Text>
    {network.isConnected === false ? <Text style={styles.offline}>{has('offline_support_ticket_creation') ? 'Нет подключения. Обращение сохранится на устройстве и отправится автоматически.' : 'Создание обращения офлайн недоступно для этой школы.'}</Text> : null}{error ? <Text style={styles.error}>{error}</Text> : null}
    <Text style={styles.label}>Категория</Text><View style={styles.categories}>{categories.map((item) => <Pressable key={item.value} style={[styles.category, category === item.value && styles.categoryActive]} onPress={() => setCategory(item.value)}><Text style={[styles.categoryText, category === item.value && styles.categoryTextActive]}>{item.label}</Text></Pressable>)}</View>
    <Text style={styles.label}>Тема</Text><TextInput value={subject} onChangeText={setSubject} maxLength={200} placeholder="Кратко опишите вопрос" placeholderTextColor={colors.muted} style={styles.input} />
    <Text style={styles.label}>Сообщение</Text><TextInput value={body} onChangeText={setBody} maxLength={4000} multiline textAlignVertical="top" placeholder="Расскажите подробнее, что произошло" placeholderTextColor={colors.muted} style={[styles.input, styles.body]} />
    <Text style={styles.note}>Вложения пока недоступны. Отправьте описание текстом.</Text>
    <Pressable disabled={submitting || subject.trim().length < 2 || !body.trim() || !has('offline_support_ticket_creation') && network.isConnected !== true} style={[styles.submit, (submitting || subject.trim().length < 2 || !body.trim() || !has('offline_support_ticket_creation') && network.isConnected !== true) && styles.disabled]} onPress={() => void submit()}><Text style={styles.submitText}>{submitting ? 'Сохранение…' : 'Создать обращение'}</Text></Pressable>
  </ScrollView></Screen>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 30 }, back: { color: colors.primary, fontSize: 15, fontWeight: '700', marginBottom: 14 }, title: { color: colors.ink, fontSize: 30, fontWeight: '800', marginBottom: 20 }, error: { color: colors.danger, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 10 }, offline: { color: colors.primary, backgroundColor: colors.surface, borderRadius: 12, padding: 12, marginBottom: 10 }, label: { color: colors.ink, fontWeight: '700', fontSize: 15, marginTop: 14, marginBottom: 8 }, categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, category: { borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.surface }, categoryActive: { backgroundColor: colors.primary, borderColor: colors.primary }, categoryText: { color: colors.ink }, categoryTextActive: { color: colors.white, fontWeight: '700' }, input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink, fontSize: 16 }, body: { minHeight: 150 }, note: { color: colors.muted, marginTop: 10, fontSize: 13 }, submit: { backgroundColor: colors.primary, borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 24 }, disabled: { opacity: 0.45 }, submitText: { color: colors.white, fontWeight: '700', fontSize: 16 },
});
