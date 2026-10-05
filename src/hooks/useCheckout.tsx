/**
 * Состояние чекаута.
 *
 * Созданный заказ и конфигурация живут ТОЛЬКО в оперативной памяти вкладки.
 * Никаких localStorage / sessionStorage / URL — это ключевое требование
 * безопасности (ТЗ п. 10): приватная конфигурация VPN не должна оседать
 * в истории браузера или хранилище.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPayment, getPaymentStatus } from '@/api';
import { toApiError, type ApiError } from '@/api/client';
import { APP_CONFIG } from '@/config/app';
import { logger } from '@/lib/logger';
import type { Order, PaymentStatus, Plan } from '@/types';

interface CheckoutValue {
  order: Order | null;
  plan: Plan | null;
  /** Начали ли оплату (нужно для UI и защиты от закрытия приложения). */
  inProgress: boolean;
  error: ApiError | null;

  /** Шаг 1: создать заказ. Возвращает созданный заказ или null. */
  begin: (plan: Plan) => Promise<Order | null>;
  /**
   * Передать выбранный тариф на экран подтверждения.
   * План живёт только в памяти — в URL он не попадает (ТЗ п. 10).
   */
  selectPlan: (plan: Plan) => void;
  /** Шаг 2: опросить статус. Возвращает финальный статус или null. */
  pollOnce: () => Promise<PaymentStatus | null>;
  /** Полный цикл опроса до терминального статуса. */
  pollUntilFinal: (
    onTick?: (attempt: number) => void,
  ) => Promise<PaymentStatus | null>;
  reset: () => void;
}

const CheckoutContext = createContext<CheckoutValue | null>(null);

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [inProgress, setInProgress] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  /**
   * Актуальный заказ в ref.
   *
   * Обязательно: `pollUntilFinal` создаётся до того, как `begin()` вернёт заказ,
   * поэтому через state-замыкание он увидел бы `order === null` и опрос
   * никогда бы не завершился. Ref всегда содержит свежее значение.
   */
  const orderRef = useRef<Order | null>(null);
  orderRef.current = order;

  const reset = useCallback(() => {
    setOrder(null);
    setPlan(null);
    setInProgress(false);
    setError(null);
  }, []);

  /** Запоминает выбранный тариф, чтобы экран подтверждения его показал. */
  const selectPlan = useCallback((selected: Plan) => {
    setPlan(selected);
    setOrder(null);
    setError(null);
  }, []);

  /**
 * Создать заказ на backend'е.
 *
 * Возвращает СОЗДАННЫЙ заказ (с актуальной суммой и ссылкой на оплату)
 * либо null, если запрос не удался.
 *
 * Сумма берётся ИЗ ОТВЕТА backend'а — клиент не имеет права её назначать.
 */
  const begin = useCallback(async (selected: Plan): Promise<Order | null> => {
    setError(null);
    setInProgress(true);
    setPlan(selected);

    try {
      // Отправляем ТОЛЬКО planId — цену определяет backend.
      const created = await createPayment(selected.id);
      setOrder(created);
      return created;
    } catch (e) {
      setError(toApiError(e));
      return null;
    } finally {
      setInProgress(false);
    }
  }, []);

  /** Один опрос статуса. Читает заказ из ref, а не из замыкания. */
  const pollOnce = useCallback(async (): Promise<PaymentStatus | null> => {
    const current = orderRef.current;
    if (!current) return null;

    try {
      const status = await getPaymentStatus(current.id);
      setOrder((prev) => (prev ? { ...prev, status: status.status, paidAt: status.paidAt } : prev));
      return status;
    } catch {
      // Сетевой сбой во время опроса — не повод показывать ошибку:
      // просто попробуем ещё раз на следующем тике.
      logger.debug('checkout', 'poll failed');
      return null;
    }
  }, []);

  /**
   * Полный цикл опроса.
   *
   * Решает ТОЛЬКО backend: статус `paid` появляется исключительно после
   * webhook'а от платёжного провайдера. Фронтенд не может «решить», что
   * оплата прошла.
   */
  const pollUntilFinal = useCallback(
    async (onTick?: (attempt: number) => void): Promise<PaymentStatus | null> => {
      const { intervalMs, maxAttempts } = APP_CONFIG.paymentPolling;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        onTick?.(attempt);

        const status = await pollOnce();

        if (status) {
          if (
            status.status === 'paid' ||
            status.status === 'failed' ||
            status.status === 'expired' ||
            status.status === 'cancelled' ||
            status.status === 'refunded'
          ) {
            return status;
          }
        }

        await new Promise<void>((resolve) => window.setTimeout(resolve, intervalMs));
      }

      logger.warn('checkout', 'polling timeout');
      return null;
    },
    [pollOnce],
  );

  // Пустой эффект удалён намеренно: очистка состояния здесь ломала поток
  // покупки в StrictMode (cleanup вызывался сразу после монтирования и
  // стирал выбранный тариф). Состояние сбрасывается в reset() после успеха.

  const value = useMemo<CheckoutValue>(
    () => ({
      order,
      plan,
      inProgress,
      error,
      begin,
      selectPlan,
      pollOnce,
      pollUntilFinal,
      reset,
    }),
    [order, plan, inProgress, error, begin, selectPlan, pollOnce, pollUntilFinal, reset],
  );

  return <CheckoutContext.Provider value={value}>{children}</CheckoutContext.Provider>;
}

export function useCheckout(): CheckoutValue {
  const ctx = useContext(CheckoutContext);
  if (!ctx) throw new Error('useCheckout должен вызываться внутри CheckoutProvider');
  return ctx;
}