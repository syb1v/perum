import { useNetInfo } from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { useCapabilities } from '../../src/auth/CapabilityProvider';
import { FeatureUnavailable } from '../../src/components/FeatureUnavailable';
import { Screen } from '../../src/components/Screen';
import { appendUniqueStudents, type FriendRequest, type SocialStudent, type SocialStudentPage, type UserBlock } from '../../src/friends/types';
import { colors } from '../../src/theme';

type Tab = 'friends' | 'requests' | 'search' | 'blocks';

export default function FriendsScreen() {
  const { apiClient } = useAuth();
  const { has } = useCapabilities();
  const network = useNetInfo();
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<SocialStudent[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [blocks, setBlocks] = useState<UserBlock[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SocialStudent[]>([]);
  const [searchCursor, setSearchCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const enabled = has('social_friends');

  async function load() {
    if (!apiClient || !enabled) return;
    setLoading(true); setError('');
    try {
      const [friendPage, inRows, outRows, blockRows] = await Promise.all([
        apiClient.get<SocialStudentPage>('/social/friends'), apiClient.get<FriendRequest[]>('/social/friend-requests?direction=incoming'), apiClient.get<FriendRequest[]>('/social/friend-requests?direction=outgoing'), apiClient.get<UserBlock[]>('/social/blocks'),
      ]);
      setFriends(friendPage.items); setCursor(friendPage.next_cursor); setIncoming(inRows); setOutgoing(outRows); setBlocks(blockRows);
    } catch { setError(network.isConnected === false ? 'Нет сети. Друзья доступны только онлайн.' : 'Не удалось загрузить друзей.'); } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [apiClient, enabled]);
  useEffect(() => {
    if (!apiClient || tab !== 'search' || !query.trim()) { setResults([]); setSearchCursor(null); return; }
    const timer = setTimeout(() => { void apiClient.get<SocialStudentPage>(`/social/students?query=${encodeURIComponent(query.trim())}`).then((page) => { setResults(page.items); setSearchCursor(page.next_cursor); }).catch(() => setError('Поиск недоступен.')); }, 350);
    return () => clearTimeout(timer);
  }, [apiClient, query, tab]);
  if (!enabled) return <FeatureUnavailable />;

  async function mutate(key: string, action: () => Promise<unknown>, navigate = false) {
    if (network.isConnected === false) { setError('Это действие доступно только онлайн. Подключитесь к сети.'); return; }
    setBusy(key); setError('');
    try { const value = await action(); if (navigate) router.push(`/(student)/messages/${(value as { id: number }).id}`); else await load(); } catch { setError('Не удалось выполнить действие. Проверьте сеть и повторите.'); } finally { setBusy(''); }
  }
  async function more(kind: 'friends' | 'search') {
    const next = kind === 'friends' ? cursor : searchCursor;
    if (!apiClient || next === null) return;
    setBusy(`${kind}-more`);
    try {
      const path = kind === 'friends' ? `/social/friends?cursor=${next}` : `/social/students?query=${encodeURIComponent(query.trim())}&cursor=${next}`;
      const page = await apiClient.get<SocialStudentPage>(path);
      if (kind === 'friends') { setFriends((items) => appendUniqueStudents(items, page.items)); setCursor(page.next_cursor); } else { setResults((items) => appendUniqueStudents(items, page.items)); setSearchCursor(page.next_cursor); }
    } catch { setError('Не удалось загрузить следующую страницу.'); } finally { setBusy(''); }
  }
  const action = (label: string, key: string, fn: () => Promise<unknown>, navigate = false) => <Pressable disabled={Boolean(busy)} onPress={() => void mutate(key, fn, navigate)}><Text style={styles.action}>{busy === key ? 'Подождите…' : label}</Text></Pressable>;
  const people = tab === 'friends' ? friends : tab === 'search' ? results : tab === 'blocks' ? blocks.map((item) => item.student) : [...incoming, ...outgoing].map((item) => item.student);
  return <Screen>
    <Pressable onPress={() => router.back()}><Text style={styles.back}>Назад</Text></Pressable><Text style={styles.title}>Друзья</Text>
    <View style={styles.tabs}>{(['friends', 'requests', 'search', 'blocks'] as Tab[]).map((value) => <Pressable key={value} onPress={() => setTab(value)}><Text style={[styles.tab, tab === value && styles.active]}>{value === 'friends' ? 'Друзья' : value === 'requests' ? 'Заявки' : value === 'search' ? 'Поиск' : 'Блокировки'}</Text></Pressable>)}</View>
    {tab === 'search' ? <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Имя или класс" /> : null}
    {network.isConnected === false ? <Text style={styles.offline}>Офлайн: просмотр может быть недоступен, изменения заблокированы.</Text> : null}{error ? <Text style={styles.error}>{error}</Text> : null}
    {loading ? <ActivityIndicator color={colors.primary} /> : <FlatList data={people} keyExtractor={(item, index) => `${item.id}-${index}`} ListEmptyComponent={<Text style={styles.empty}>{tab === 'search' && !query ? 'Введите имя ученика' : 'Здесь пока пусто'}</Text>} renderItem={({ item }) => {
      const requestIn = incoming.find((row) => row.student.id === item.id); const requestOut = outgoing.find((row) => row.student.id === item.id);
      return <View style={styles.row}><View style={styles.identity}><Text style={styles.name}>{item.name}</Text><Text style={styles.className}>{item.class_name}</Text></View><View style={styles.actions}>{tab === 'friends' ? <>{action('Написать', `chat-${item.id}`, () => apiClient!.post('/social/conversations', { student_id: item.id }), true)}{action('Удалить', `remove-${item.id}`, () => apiClient!.del(`/social/friends/${item.id}`))}{action('Блок', `block-${item.id}`, () => apiClient!.post('/social/blocks', { student_id: item.id }))}</> : tab === 'requests' && requestIn ? <>{action('Принять', `accept-${requestIn.id}`, () => apiClient!.post(`/social/friend-requests/${requestIn.id}/accept`))}{action('Отклонить', `reject-${requestIn.id}`, () => apiClient!.post(`/social/friend-requests/${requestIn.id}/reject`))}</> : tab === 'requests' && requestOut ? action('Отменить', `cancel-${requestOut.id}`, () => apiClient!.post(`/social/friend-requests/${requestOut.id}/cancel`)) : tab === 'blocks' ? action('Разблокировать', `unblock-${item.id}`, () => apiClient!.del(`/social/blocks/${item.id}`)) : <>{action('Добавить', `add-${item.id}`, () => apiClient!.post('/social/friend-requests', { student_id: item.id, client_request_id: crypto.randomUUID() }))}{action('Блок', `block-${item.id}`, () => apiClient!.post('/social/blocks', { student_id: item.id }))}</>}</View></View>;
    }} ListFooterComponent={(tab === 'friends' ? cursor : tab === 'search' ? searchCursor : null) !== null ? <Pressable onPress={() => void more(tab === 'friends' ? 'friends' : 'search')}><Text style={styles.more}>Показать ещё</Text></Pressable> : null} />}
  </Screen>;
}

const styles = StyleSheet.create({ back: { color: colors.primary, fontWeight: '700' }, title: { color: colors.ink, fontSize: 32, fontWeight: '800', marginTop: 14 }, tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginVertical: 20 }, tab: { color: colors.muted, fontWeight: '700' }, active: { color: colors.primary }, input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 12 }, offline: { color: colors.muted, marginBottom: 10 }, error: { color: colors.danger, marginBottom: 10 }, row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, marginBottom: 10 }, identity: { marginBottom: 12 }, name: { color: colors.ink, fontSize: 17, fontWeight: '700' }, className: { color: colors.muted, marginTop: 4 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, action: { color: colors.primary, fontWeight: '700' }, empty: { color: colors.muted, textAlign: 'center', marginTop: 50 }, more: { color: colors.primary, textAlign: 'center', fontWeight: '700', padding: 18 } });
