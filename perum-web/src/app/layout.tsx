import type { Metadata } from 'next';
// import { Inter } from 'next/font/google';
import '@/styles/globals.css';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AnalyticsTracker />
        <Providers>
          <ToastProvider>
            <AuthProvider>
              {children}
              <PWAInstallPrompt />
            </AuthProvider>
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
