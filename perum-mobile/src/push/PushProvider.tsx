import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { getInstallation } from './installation';
import { hasActivePushRegistration, parsePushTap, type PushRegistration, type PushRegistrationPut, type PushRegistrationStatus } from './types';
import { useCapabilities } from '../auth/CapabilityProvider';
import { runtimeConfig } from '../config/runtime';
import { submitNavigationIntent } from '../links/intentCoordinator';
import { acquirePushToken, type PushTokenProvider } from './providerCore';

const expoPushTokenProvider: PushTokenProvider = { getToken: async (projectId) => (await Notifications.getExpoPushTokenAsync({ projectId })).data };

type PushState = { available: boolean; registered: boolean; busy: boolean; error: string | null; enable: () => Promise<void>; revoke: () => Promise<void> };
const PushContext = createContext<PushState | null>(null);

export function PushProvider({ children }: PropsWithChildren) {
  const { account, apiClient } = useAuth();
  const { has } = useCapabilities();
  const enabled = has('push_registration');
  const [state, setState] = useState({ available: false, registered: false, busy: false, error: null as string | null });

  useEffect(() => {
    if (!apiClient || !enabled) return setState({ available: false, registered: false, busy: false, error: enabled ? null : 'Функция недоступна для этой школы' });
    void apiClient.get<PushRegistrationStatus>('/push/registration').then((value) => setState((current) => ({ ...current, available: value.registration_available, registered: hasActivePushRegistration(value) }))).catch(() => undefined);
  }, [account?.id, enabled]);

  async function register(token: string) {
    if (!apiClient || !account || !enabled) return;
    const installation = await getInstallation();
    const payload: PushRegistrationPut = { installation_secret: installation.secret, provider: 'expo', environment: runtimeConfig.buildEnvironment === 'production' ? 'production' : 'development', token, platform: Platform.OS === 'ios' ? 'ios' : 'android', app_id: 'app.perum.mobile', app_version: Constants.expoConfig?.version ?? null, device_name: Constants.deviceName ?? null };
    await apiClient.put<PushRegistration>(`/push/installations/${installation.id}/registration`, payload);
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
      const projectId = runtimeConfig.projectId;
      if (!projectId) throw new Error('Expo project ещё не настроен');
      await register(await acquirePushToken(expoPushTokenProvider, projectId));
    } catch (error) { setState((current) => ({ ...current, error: error instanceof Error ? error.message : 'Не удалось включить уведомления' })); }
    finally { setState((current) => ({ ...current, busy: false })); }
  }

  async function revoke() {
    if (!apiClient || !enabled) return;
    const installation = await getInstallation();
    try { await apiClient.del(`/push/installations/${installation.id}/registration`, { headers: { 'X-Installation-Proof': installation.secret } }); } finally { setState((current) => ({ ...current, registered: false })); }
  }

  useEffect(() => {
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      const projectId = runtimeConfig.projectId;
      if (projectId) void acquirePushToken(expoPushTokenProvider, projectId).then(register).catch(() => undefined);
    });
    const consumeResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const tap = parsePushTap(response.notification.request.content.data, response.notification.request.identifier);
      if (tap) submitNavigationIntent(tap.url, `push:${tap.id}`);
    };
    void Notifications.getLastNotificationResponseAsync().then(consumeResponse).catch(() => undefined);
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(consumeResponse);
    return () => { tokenSubscription.remove(); responseSubscription.remove(); };
  }, [account?.id, enabled]);

  return <PushContext.Provider value={{ ...state, enable, revoke }}>{children}</PushContext.Provider>;
}

export function usePush() {
  const value = useContext(PushContext);
  if (!value) throw new Error('PushProvider is missing');
  return value;
}
