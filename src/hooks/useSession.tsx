/**
 * Контекст сессии и данных пользователя.
 *
 * Здесь НЕТ авторизации как таковой: нет логина, пароля, токенов.
 * Пользователь идентифицируется backend'ом по подписанной Telegram initData,
 * которую клиент просто прикладывает к каждому запросу (ТЗ п. 16).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getHealth, getHomeData, getSubscription } from '@/api';
import { ApiError, toApiError } from '@/api/client';
import { isInsideTelegram, whenTelegramReady } from '@/lib/telegram';
import type { HealthResponse, Subscription, User } from '@/types';

interface SessionValue {
  user: User | null;
  subscription: Subscription | null;
  /** Публичные параметры приложения: минимальная сумма вывода и т.п. */
  health: HealthResponse | null;
  /** Приложение открыто вне Telegram — показываем честный экран. */
  outsideTelegram: boolean;
  loading: boolean;
  error: ApiError | null;
  /** Перезагрузить данные (после оплаты, возврата с экрана и т.п.). */
  refresh: () => Promise<void>;
  /** Обновить только подписку — дешевле, чем весь профиль. */
  refreshSubscription: () => Promise<void>;
  setSubscription: (sub: Subscription) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscriptionState] = useState<Subscription | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [outsideTelegram, setOutsideTelegram] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // Пользователь + подписка параллельно; health — отдельным запросом.
      const [home, healthData] = await Promise.all([
        getHomeData(),
        getHealth().catch(() => null),
      ]);
      setUser(home.user);
      setSubscriptionState(home.subscription);
      if (healthData) setHealth(healthData);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Telegram SDK может подгрузиться чуть позже скрипта страницы.
      await whenTelegramReady();

      if (cancelled) return;

      if (!isInsideTelegram()) {
        setOutsideTelegram(true);
        setLoading(false);
        return;
      }

      setOutsideTelegram(false);
      setLoading(true);
      await load();
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const refreshSubscription = useCallback(async () => {
    try {
      const sub = await getSubscription();
      setSubscriptionState(sub);
    } catch {
      /* тихо игнорируем: следующий полный refresh догонит */
    }
  }, []);

  const setSubscription = useCallback((sub: Subscription) => {
    setSubscriptionState(sub);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      subscription,
      health,
      outsideTelegram,
      loading,
      error,
      refresh,
      refreshSubscription,
      setSubscription,
    }),
    [user, subscription, health, outsideTelegram, loading, error, refresh, refreshSubscription, setSubscription],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession должен вызываться внутри SessionProvider');
  return ctx;
}