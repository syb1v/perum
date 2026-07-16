import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Linking, Platform } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { getInstallation } from './installation';

type PushState = { available: boolean; registered: boolean; busy: boolean; error: string | null; enable: () => Promise<void>; revoke: () => Promise<void> };
const PushContext = createContext<PushState | null>(null);

export function PushProvider({ children }: PropsWithChildren) {
  const { account, apiClient } = useAuth();
  const [state, setState] = useState({ available: false, registered: false, busy: false, error: null as string | null });

  useEffect(() => {
    if (!apiClient) return setState({ available: false, registered: false, busy: false, error: null });
    void apiClient.get<{ registration_available: boolean; registered: boolean }>('/push/registration').then((value) => setState((current) => ({ ...current, available: value.registration_available, registered: value.registered }))).catch(() => undefined);
  }, [account?.id]);

  async function register(token: string) {
    if (!apiClient || !account) return;
    const installation = await getInstallation();
    await apiClient.put(`/push/installations/${installation.id}/registration`, { installation_secret: installation.secret, provider: 'expo', environment: __DEV__ ? 'development' : 'production', token, platform: Platform.OS, app_id: 'app.perum.mobile', app_version: Constants.expoConfig?.version ?? null, device_name: Constants.deviceName ?? null });
    setState((current) => ({ ...current, registered: true, error: null }));
  }

  async function enable() {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      if (!state.available) throw new Error('Регистрация уведомлений пока недоступна на сервере');
      if (!Device.isDevice) throw new Error('Для push-уведомлений требуется физическое устройство');
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'PERUM', importance: Notifications.AndroidImportance.DEFAULT });
      const permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted) throw new Error('Разрешение на уведомления не предоставлено');
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) throw new Error('Expo project ещё не настроен');
      await register((await Notifications.getExpoPushTokenAsync({ projectId })).data);
    } catch (error) { setState((current) => ({ ...current, error: error instanceof Error ? error.message : 'Не удалось включить уведомления' })); }
    finally { setState((current) => ({ ...current, busy: false })); }
  }

  async function revoke() {
    if (!apiClient) return;
    const installation = await getInstallation();
    try { await apiClient.del(`/push/installations/${installation.id}/registration`, { headers: { 'X-Installation-Proof': installation.secret } }); } finally { setState((current) => ({ ...current, registered: false })); }
  }

  useEffect(() => {
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (projectId) void Notifications.getExpoPushTokenAsync({ projectId }).then((token) => register(token.data)).catch(() => undefined);
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') void Linking.openURL(url).catch(() => undefined);
    });
    return () => { tokenSubscription.remove(); responseSubscription.remove(); };
  }, [account?.id]);

  return <PushContext.Provider value={{ ...state, enable, revoke }}>{children}</PushContext.Provider>;
}

export function usePush() {
  const value = useContext(PushContext);
  if (!value) throw new Error('PushProvider is missing');
  return value;
}
