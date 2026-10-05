/**
 * Корень приложения: провайдеры + роутинг.
 *
 * Страницы, кроме главной, загружаются лениво (ТЗ п. 33) — при старте
 * в бандл попадает только Home, а тарифы/рефералы/инструкции приходят
 * по требованию.
 */

import { Suspense, lazy } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { HomeSkeleton } from '@/components/LoadingSkeleton';
import { AppShell } from '@/layouts/AppShell';
import { CheckoutProvider } from '@/hooks/useCheckout';
import { SessionProvider } from '@/hooks/useSession';
import { ToastProvider } from '@/hooks/useToast';
import { RouterProvider, useRouter } from '@/lib/router';

/* ── Главный экран — в основном бандле (первый экран) ─────────────────── */
import HomePage from '@/pages/Home';

/* ── Остальные — code splitting ────────────────────────────────────────── */
const SubscriptionPage = lazy(() => import('@/pages/Subscription'));
const PlansPage = lazy(() => import('@/pages/Plans'));
const CheckoutPage = lazy(() => import('@/pages/Checkout'));
const PaymentSuccessPage = lazy(() => import('@/pages/PaymentSuccess'));
const VpnConfigPage = lazy(() => import('@/pages/VpnConfig'));
const InstructionsPage = lazy(() => import('@/pages/Instructions'));
const ReferralsPage = lazy(() => import('@/pages/Referrals'));
const ProfilePage = lazy(() => import('@/pages/Profile'));
const HelpPage = lazy(() => import('@/pages/Help'));
const PrivacyPage = lazy(() => import('@/pages/Privacy'));

function CurrentScreen() {
  const { route } = useRouter();

  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'subscription':
      return <SubscriptionPage />;
    case 'plans':
      return <PlansPage />;
    case 'checkout':
      return <CheckoutPage />;
    case 'payment-success':
      return <PaymentSuccessPage />;
    case 'vpn':
      return <VpnConfigPage />;
    case 'instructions':
      return <InstructionsPage />;
    case 'referrals':
      return <ReferralsPage />;
    case 'profile':
      return <ProfilePage />;
    case 'help':
      return <HelpPage />;
    case 'privacy':
      return <PrivacyPage />;
    default:
      return <HomePage />;
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <SessionProvider>
        <ToastProvider>
          <CheckoutProvider>
            <RouterProvider>
              <AppShell>
                <Suspense fallback={<HomeSkeleton />}>
                  <CurrentScreen />
                </Suspense>
              </AppShell>
            </RouterProvider>
          </CheckoutProvider>
        </ToastProvider>
      </SessionProvider>
    </ErrorBoundary>
  );
}