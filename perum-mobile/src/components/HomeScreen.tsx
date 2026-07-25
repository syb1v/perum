import { router } from 'expo-router';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNetInfo } from '@react-native-community/netinfo';
import { useAuth } from '../auth/AuthProvider';
import type { TenantUser } from '../auth/types';
import { queryKeys } from '../query/queryKeys';
import { colors } from '../theme';
import { Screen } from './Screen';
import { preferencesSnapshot, usePreferencesSync } from '../preferences/PreferencesProvider';
import type { Preferences, PreferencesSnapshot } from '../preferences/types';
import { usePush } from '../push/PushProvider';
import { useCapabilities } from '../auth/CapabilityProvider';
import { isSchoolSupportOperator } from '@perum/domain';

const roleNames: Record<string, string> = { student: 'Ученик', parent: 'Родитель', teacher: 'Учитель', admin: 'Администратор', school_admin: 'Администратор школы', director: 'Директор' };

export function HomeScreen() {
  const { account, apiClient, signOut, busy, descriptorReason } = useAuth();
  if (!account) return null;
  if (!apiClient) return <Screen><Text style={styles.title}>{descriptorReason === 'app_outdated' ? 'Обновите приложение' : descriptorReason === 'tenant_release_outdated' ? 'Школе требуется обновление' : descriptorReason === 'grace_expired' ? 'Подключитесь к сети' : 'Функции школы недоступны'}</Text><Text style={styles.cardBody}>{descriptorReason === 'grace_expired' ? 'Срок автономной работы истёк. Данные аккаунта и ожидающие отправки сохранены.' : 'Мы заблокировали запросы к школе до безопасной проверки совместимости.'}</Text></Screen>;
  return <AccountHome account={account} apiClient={apiClient} signOut={signOut} busy={busy} />;
}

function AccountHome({ account, apiClient, signOut, busy }: { account: NonNullable<ReturnType<typeof useAuth>['account']>; apiClient: NonNullable<ReturnType<typeof useAuth>['apiClient']>; signOut: () => Promise<void>; busy: boolean }) {
  const network = useNetInfo();
  const { has } = useCapabilities();
  const sync = usePreferencesSync();
  const push = usePush();
  const me = useQuery({
    queryKey: queryKeys.me(account.id),
    queryFn: () => apiClient.get<TenantUser>('/user/me'),
  });
  const user = me.data ?? account.user;
  const supportOperator = isSchoolSupportOperator(user.role) && has('support_admin');
  const preferences = useQuery({
    queryKey: queryKeys.preferences(account.id),
    queryFn: async () => preferencesSnapshot(await apiClient.get<Preferences>('/user/preferences')),
    enabled: has('offline_preferences'),
  });
  const notifications = useQuery({ queryKey: queryKeys.notifications(account.id), enabled: supportOperator, queryFn: () => apiClient.get<import('../notifications/core').NotificationList>('/user/notifications'), refetchInterval: 30_000 });
  const server = preferences.data as PreferencesSnapshot | undefined;
  const desired = sync.mutation?.desired ?? server?.data.push_preview_enabled ?? false;
  const syncLabels = { pending: 'Ожидает синхронизации', sending: 'Синхронизация…', retry_wait: 'Повторим автоматически', conflict: 'Конфликт версии', blocked_auth: 'Требуется авторизация', failed_permanent: 'Не удалось синхронизировать' };
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.login;
  const status = !me.data ? 'Загрузка данных…' : me.isFetching ? 'Обновляем данные…' : network.isConnected === false ? 'Офлайн: показаны сохранённые данные' : me.isStale ? 'Показаны сохранённые данные' : 'Данные актуальны';
  return <Screen>
    <View style={styles.badge}><Text style={styles.badgeText}>PERUM</Text></View>
    <Text style={styles.eyebrow}>{roleNames[user.role] || user.role}</Text>
    <Text style={styles.title}>Здравствуйте, {name}</Text>
    <Text style={styles.school}>{account.tenantName}</Text>
    <View style={styles.card}>
      <Text style={styles.cardLabel}>Школьное пространство</Text>
      <Text style={styles.cardTitle}>Ваша сессия защищена</Text>
      <Text style={styles.cardBody}>Аккаунт восстановится автоматически при следующем запуске приложения.</Text>
      <Text style={styles.cacheStatus}>{status}</Text>
      <Pressable disabled={me.isFetching} onPress={() => void me.refetch()}><Text style={styles.refresh}>{me.isFetching ? 'Обновление…' : 'Обновить вручную'}</Text></Pressable>
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>Push-уведомления</Text><Text style={styles.cardBody}>{has('push_registration') ? push.registered ? 'Устройство зарегистрировано. Доставка включится после настройки провайдера школой.' : 'Уведомления включаются только по вашему запросу.' : 'Функция недоступна для этой школы.'}</Text>{push.error ? <Text style={styles.error}>{push.error}</Text> : null}{has('push_registration') ? <Pressable disabled={push.busy} onPress={() => void (push.registered ? push.revoke() : push.enable())}><Text style={styles.refresh}>{push.busy ? 'Проверяем…' : push.registered ? 'Отключить на этом устройстве' : 'Включить уведомления'}</Text></Pressable> : null}</View>
    <View style={styles.card}>
      <View style={styles.settingRow}>
        <View style={styles.settingText}><Text style={styles.cardTitle}>Превью push-уведомлений</Text><Text style={styles.cardBody}>Показывать содержание уведомления на экране устройства.</Text></View>
        <Switch disabled={!has('offline_preferences') || (!server && !sync.mutation)} value={desired} onValueChange={(value) => void sync.enqueue(value, sync.mutation?.baseEtag ?? server?.etag ?? '')} />
      </View>
      <Text style={styles.cacheStatus}>{sync.mutation ? syncLabels[sync.mutation.state] : preferences.isFetching ? 'Загрузка настроек…' : 'Синхронизировано'}</Text>
      {sync.mutation?.state === 'conflict' ? <View style={styles.conflict}>
        <Text style={styles.cardBody}>Настройка была изменена на другом устройстве. Какую версию оставить?</Text>
        <Pressable onPress={() => void sync.resolve('server')}><Text style={styles.refresh}>Использовать серверную</Text></Pressable>
        <Pressable onPress={() => void sync.resolve('local')}><Text style={styles.refresh}>Сохранить мою</Text></Pressable>
      </View> : null}
    </View>
    <View style={styles.spacer} />
    {user.role === 'student' && has('offline_homework_state') ? <Pressable style={styles.primary} onPress={() => router.push('/(student)/homework')}><Text style={styles.primaryText}>Домашние задания</Text></Pressable> : null}
    {user.role === 'student' && has('student_academics') ? <Pressable style={styles.primary} onPress={() => router.push('/(student)/academics' as never)}><Text style={styles.primaryText}>Дневник и оценки</Text></Pressable> : null}
    {user.role === 'student' && has('social_friends') ? <Pressable style={styles.primary} onPress={() => router.push('/(student)/friends')}><Text style={styles.primaryText}>Друзья</Text></Pressable> : null}
    {user.role === 'student' && has('social_messages') ? <Pressable style={styles.primary} onPress={() => router.push('/(student)/messages')}><Text style={styles.primaryText}>Сообщения</Text></Pressable> : null}
    {(user.role === 'student' || user.role === 'parent' || user.role === 'teacher') && has('support_requester') ? <Pressable style={styles.primary} onPress={() => router.push('/support')}><Text style={styles.primaryText}>Поддержка школы</Text></Pressable> : null}
    {supportOperator ? <Pressable style={styles.primary} onPress={() => router.push('/admin-support')}><Text style={styles.primaryText}>Очередь поддержки</Text></Pressable> : null}
    {supportOperator ? <Pressable style={styles.primary} onPress={() => router.push('/notifications')}><Text style={styles.primaryText}>Уведомления{notifications.data?.unread_count ? ` · ${notifications.data.unread_count}` : ''}</Text></Pressable> : null}
    <Pressable style={styles.primary} onPress={() => router.push('/accounts')}><Text style={styles.primaryText}>Сменить аккаунт</Text></Pressable>
    <Pressable disabled={busy} style={styles.secondary} onPress={() => void signOut()}><Text style={styles.secondaryText}>{busy ? 'Выходим…' : 'Выйти из аккаунта'}</Text></Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 42 },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  eyebrow: { color: colors.primary, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 34, fontWeight: '800', lineHeight: 40, marginTop: 8 },
  school: { color: colors.muted, fontSize: 17, marginTop: 8 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 22, padding: 22, marginTop: 34 },
  cardLabel: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  cardTitle: { color: colors.ink, fontSize: 22, fontWeight: '700', marginTop: 12 },
  cardBody: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  cacheStatus: { color: colors.muted, fontSize: 13, marginTop: 18 },
  refresh: { color: colors.primary, fontSize: 14, fontWeight: '700', marginTop: 10 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  settingText: { flex: 1 },
  conflict: { marginTop: 10 },
  spacer: { flex: 1 },
  primary: { backgroundColor: colors.primary, borderRadius: 16, padding: 17, alignItems: 'center', marginTop: 8 },
  primaryText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  secondary: { padding: 17, alignItems: 'center', marginTop: 6 },
  secondaryText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, marginTop: 8 },
});
