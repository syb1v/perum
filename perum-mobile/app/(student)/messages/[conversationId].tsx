import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetInfo } from '@react-native-community/netinfo';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../../src/auth/AuthProvider';
import { useMessagesSync } from '../../../src/messages/MessagesProvider';
import type { Conversation, DisplayMessage, Message, MessagePage, ReportCreate, ReportOut } from '../../../src/messages/types';
import { queryKeys } from '../../../src/query/queryKeys';
import { colors } from '../../../src/theme';
import { useRealtimeStatus } from '../../../src/realtime/RealtimeProvider';
import { useCapabilities } from '../../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../../src/components/FeatureUnavailable';

export default function ThreadScreen() {
  const params = useLocalSearchParams<{ conversationId: string }>();
  const conversationId = Number(params.conversationId);
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const enabled = has('social_messages');
  const sendEnabled = enabled && has('offline_social_messages');
  const sync = useMessagesSync();
  const queryClient = useQueryClient();
  const network = useNetInfo();
  const realtime = useRealtimeStatus();
  const [body, setBody] = useState('');
  const [report, setReport] = useState<{ message: Message; category: ReportCreate['category']; comment: string; clientId: string } | null>(null);
  const [reportState, setReportState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const conversation = useQuery({ queryKey: queryKeys.conversation(account?.id ?? '', conversationId), enabled: Boolean(enabled && account && apiClient && Number.isFinite(conversationId)), queryFn: () => apiClient!.get<Conversation>(`/social/conversations/${conversationId}`), refetchInterval: 15_000 });
  const history = useInfiniteQuery({
    queryKey: queryKeys.messages(account?.id ?? '', conversationId), enabled: Boolean(enabled && account && apiClient && Number.isFinite(conversationId)), initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => apiClient!.get<MessagePage>(`/social/conversations/${conversationId}/messages?limit=50${pageParam === null ? '' : `&cursor=${pageParam}`}`),
    getNextPageParam: (page) => page.next_cursor ?? undefined, refetchInterval: 10_000,
  });
  useFocusEffect(useCallback(() => { if (!enabled) return; void history.refetch(); void conversation.refetch(); }, [enabled, history.refetch, conversation.refetch]));
  const serverMessages = history.data?.pages.flatMap((page) => page.items) ?? [];
  const serverIds = new Set(serverMessages.map((item) => item.client_message_id));
  const optimistic: DisplayMessage[] = sync.pending.filter((item) => item.conversationId === conversationId && !serverIds.has(item.clientMessageId)).map((item) => ({ id: -item.createdAt, sender_id: account?.user.id ?? 0, client_message_id: item.clientMessageId, body: item.body, created_at: new Date(item.createdAt).toISOString(), expires_at: '', delivery: item.state === 'failed_permanent' ? 'failed' : 'pending' }));
  const messages: DisplayMessage[] = [...serverMessages, ...optimistic].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id);
  const latestId = serverMessages.reduce((max, item) => Math.max(max, item.id), 0);
  useEffect(() => {
    if (!enabled || !apiClient || !account || !latestId || !conversation.data?.unread_count) return;
    void apiClient.post(`/social/conversations/${conversationId}/read`, { message_id: latestId }).then(() => {
      queryClient.setQueryData(queryKeys.conversation(account.id, conversationId), { ...conversation.data, unread_count: 0 });
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations(account.id) });
    }).catch(() => undefined);
  }, [enabled, account?.id, apiClient, conversation.data?.unread_count, conversationId, latestId, queryClient]);
  const send = async () => { const text = body.trim(); if (!sendEnabled || !text || text.length > 4000 || !conversation.data?.can_send) return; setBody(''); await sync.enqueue(conversationId, text); };
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const openReport = (message: DisplayMessage) => {
    if (message.delivery || message.sender_id === account?.user.id || message.body === null) return;
    setReport({ message, category: 'harassment', comment: '', clientId: `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` });
    setReportState('idle');
  };
  const closeReport = () => { if (reportState !== 'sending') { setReport(null); setReportState('idle'); } };
  const submitReport = async () => {
    if (!enabled || !report || !apiClient || report.message.sender_id === account?.user.id || report.message.body === null || offline) return;
    setReportState('sending');
    const payload: ReportCreate = { message_id: report.message.id, category: report.category, comment: report.comment.trim() || null, client_report_id: report.clientId };
    try { await apiClient.post<ReportOut>('/social/reports', payload); setReportState('success'); }
    catch { setReportState('error'); }
  };
  const categories: { value: ReportCreate['category']; label: string }[] = [{ value: 'harassment', label: 'Оскорбления' }, { value: 'bullying', label: 'Травля' }, { value: 'threats', label: 'Угрозы' }, { value: 'hate', label: 'Язык ненависти' }, { value: 'sexual', label: 'Неприемлемый контент' }, { value: 'spam', label: 'Спам' }, { value: 'other', label: 'Другое' }];
  if (!enabled) return <FeatureUnavailable />;
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable><View><Text style={styles.title}>{conversation.data?.peer.name ?? 'Диалог'}</Text><Text style={styles.subtitle}>{conversation.data?.peer.class_name ?? ''}</Text>{realtime !== 'connected' ? <Text style={styles.status}>{realtime === 'reconnecting' ? 'Переподключение…' : 'Обновление по опросу'}</Text> : null}</View></View>
    {history.isLoading ? <ActivityIndicator color={colors.primary} /> : <FlatList
      inverted data={messages} keyExtractor={(item) => item.client_message_id} contentContainerStyle={styles.list}
      onEndReached={() => { if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage(); }}
      renderItem={({ item }) => { const own = item.sender_id === account?.user.id; const reportable = !own && !item.delivery && item.body !== null; return <View style={[styles.messageRow, own && styles.ownRow]}><Pressable disabled={!reportable} onLongPress={() => openReport(item)} style={[styles.bubble, own ? styles.own : styles.peer]} accessibilityHint={reportable ? 'Удерживайте, чтобы пожаловаться' : undefined}><Text style={[styles.message, own && styles.ownText, item.body === null && styles.tombstone]}>{item.body ?? 'Сообщение скрыто модератором'}</Text>{item.delivery ? <Pressable disabled={item.delivery !== 'failed'} onPress={() => void sync.retry(item.client_message_id)}><Text style={[styles.delivery, own && styles.ownDelivery]}>{item.delivery === 'failed' ? 'Не отправлено. Повторить' : 'Отправляется…'}</Text></Pressable> : null}</Pressable>{reportable ? <Pressable accessibilityRole="button" accessibilityLabel="Пожаловаться на сообщение" hitSlop={8} onPress={() => openReport(item)}><Text style={styles.reportLink}>Пожаловаться</Text></Pressable> : null}</View>; }}
      ListFooterComponent={history.isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null}
    />}
    {!sendEnabled ? <Text style={styles.readOnly}>Отправка сообщений недоступна для этой школы</Text> : conversation.data && !conversation.data.can_send ? <Text style={styles.readOnly}>Переписка заблокирована модератором и доступна только для чтения</Text> : <View style={styles.composer}><TextInput multiline maxLength={4000} value={body} onChangeText={setBody} placeholder="Сообщение" style={styles.input} /><Pressable disabled={!body.trim()} style={[styles.send, !body.trim() && styles.sendDisabled]} onPress={() => void send()}><Text style={styles.sendText}>Отправить</Text></Pressable></View>}
    <Modal visible={report !== null} transparent animationType="slide" onRequestClose={closeReport}>
      <View style={styles.modalBackdrop}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboard}><ScrollView contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled"><Text style={styles.modalTitle}>Пожаловаться на сообщение</Text>{reportState === 'success' ? <><Text accessibilityLiveRegion="polite" style={styles.success}>Жалоба отправлена модераторам школы.</Text><Pressable style={styles.send} onPress={closeReport}><Text style={styles.sendText}>Закрыть</Text></Pressable></> : <><Text style={styles.label}>Причина</Text><View style={styles.categories}>{categories.map((category) => <Pressable key={category.value} accessibilityRole="radio" accessibilityState={{ checked: report?.category === category.value }} style={[styles.category, report?.category === category.value && styles.categorySelected]} onPress={() => setReport((current) => current ? { ...current, category: category.value } : current)}><Text style={[styles.categoryText, report?.category === category.value && styles.categoryTextSelected]}>{category.label}</Text></Pressable>)}</View><Text style={styles.label}>Комментарий (необязательно)</Text><TextInput multiline maxLength={1000} value={report?.comment ?? ''} onChangeText={(comment) => setReport((current) => current ? { ...current, comment } : current)} style={[styles.input, styles.comment]} /><Text style={styles.notice}>Жалобу и содержание сообщения увидят уполномоченные модераторы школы. Отправитель сообщения не увидит, кто подал жалобу, но абсолютная анонимность не гарантируется.</Text>{offline ? <Text accessibilityLiveRegion="polite" style={styles.reportError}>Для отправки жалобы нужно подключение к интернету. Жалоба не сохранена на устройстве.</Text> : null}{reportState === 'error' ? <Text accessibilityLiveRegion="polite" style={styles.reportError}>Не удалось отправить жалобу. Повторная попытка не создаст дубликат.</Text> : null}<View style={styles.actions}><Pressable disabled={reportState === 'sending'} style={styles.cancel} onPress={closeReport}><Text style={styles.cancelText}>Отмена</Text></Pressable><Pressable disabled={reportState === 'sending' || offline} style={[styles.send, (reportState === 'sending' || offline) && styles.sendDisabled]} onPress={() => void submitReport()}><Text style={styles.sendText}>{reportState === 'sending' ? 'Отправка…' : reportState === 'error' ? 'Повторить' : 'Отправить'}</Text></Pressable></View></>}</ScrollView></KeyboardAvoidingView></View>
    </Modal>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingTop: 56, paddingHorizontal: 18 }, header: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingBottom: 15 }, back: { color: colors.primary, fontWeight: '700' }, title: { color: colors.ink, fontSize: 20, fontWeight: '800' }, subtitle: { color: colors.muted, marginTop: 2 }, status: { color: colors.muted, fontSize: 11, marginTop: 3 }, list: { paddingVertical: 12, gap: 8 },
  messageRow: { maxWidth: '82%', alignSelf: 'flex-start', alignItems: 'flex-start' }, ownRow: { alignSelf: 'flex-end', alignItems: 'flex-end' }, bubble: { borderRadius: 17, paddingHorizontal: 14, paddingVertical: 10 }, own: { backgroundColor: colors.primary }, peer: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }, message: { color: colors.ink, fontSize: 16, lineHeight: 21 }, tombstone: { color: colors.muted, fontStyle: 'italic' }, ownText: { color: colors.white }, delivery: { color: colors.muted, fontSize: 11, marginTop: 5 }, ownDelivery: { color: colors.white }, reportLink: { color: colors.muted, fontSize: 12, paddingTop: 4, paddingHorizontal: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingVertical: 10 }, input: { flex: 1, maxHeight: 120, borderColor: colors.border, borderWidth: 1, borderRadius: 18, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 11, color: colors.ink }, send: { backgroundColor: colors.primary, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }, sendDisabled: { opacity: 0.45 }, sendText: { color: colors.white, fontWeight: '700' }, readOnly: { color: colors.muted, textAlign: 'center', padding: 18 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }, modalKeyboard: { maxHeight: '92%' }, modal: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34 }, modalTitle: { color: colors.ink, fontSize: 22, fontWeight: '800', marginBottom: 20 }, label: { color: colors.ink, fontWeight: '700', marginBottom: 9, marginTop: 4 }, categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }, category: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9 }, categorySelected: { borderColor: colors.primary, backgroundColor: colors.primary }, categoryText: { color: colors.ink }, categoryTextSelected: { color: colors.white, fontWeight: '700' }, comment: { flex: 0, height: 100, maxHeight: 100, textAlignVertical: 'top', marginBottom: 14 }, notice: { color: colors.muted, fontSize: 13, lineHeight: 18 }, reportError: { color: '#b42318', marginTop: 12, lineHeight: 19 }, success: { color: colors.ink, fontSize: 16, lineHeight: 22, marginBottom: 20 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 }, cancel: { borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 }, cancelText: { color: colors.ink, fontWeight: '700' },
});
