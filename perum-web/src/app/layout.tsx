import type { Metadata } from 'next';
import '@/styles/globals.css';
import { headers } from 'next/headers';
import { isPlatformHostname, isApexHostname } from '@/lib/host';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import AnalyticsTracker from '@/components/AnalyticsTracker';
import Providers from '@/components/Providers';
import PWAInstallPrompt from '@/components/ui/PWAInstallPrompt';

export const metadata: Metadata = {
  title: 'ПЭРУМ — Платформа Экономико-Аналитического Развития Учащейся Молодёжи',
  description: 'Геймифицированный электронный журнал для школ. Оценки → Баллы → Квесты → Рейтинги.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ПЭРУМ',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover' as const,
  themeColor: '#6366f1',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Host-based tenancy: the control-plane UI (admin.*) и лендинг ядра (апекс)
  // не используют школьные auth/data-провайдеры, поэтому рендерятся «голыми».
  // Иначе AuthProvider до завершения checkAuth показывал бы «Загрузка…» вместо
  // лендинга (нулевой SSR/SEO — см. docs/AUDIT_2026-06-12.md). Школьные поддомены
  // получают полный стек (AuthProvider гейтит контент по /user/me).
  const host = (await headers()).get('host') || '';
  const bare = isPlatformHostname(host) || isApexHostname(host);

  return (
    <html lang="ru">
      <body>
        {bare ? (
          children
        ) : (
          <>
            <AnalyticsTracker />
            <Providers>
              <ToastProvider>
                <AuthProvider>
                  {children}
                  <PWAInstallPrompt />
                </AuthProvider>
              </ToastProvider>
            </Providers>
          </>
        )}
      </body>
    </html>
  );
}
