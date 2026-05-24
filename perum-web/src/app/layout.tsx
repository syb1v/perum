import type { Metadata } from 'next';
import '@/styles/globals.css';
import { headers } from 'next/headers';
import { isPlatformHostname } from '@/lib/host';
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
  // Host-based tenancy: the control-plane UI (admin.*) doesn't use the school's
  // auth/data providers, so render it bare. Tenant subdomains get the full
  // legacy school stack (AuthProvider gates content on the /user/me check).
  const host = (await headers()).get('host') || '';
  const isPlatform = isPlatformHostname(host);

  return (
    <html lang="ru">
      <body>
        {isPlatform ? (
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
