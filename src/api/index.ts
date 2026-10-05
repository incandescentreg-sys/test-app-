/**
 * ЕДИНСТВЕННАЯ точка общения фронтенда с backend.
 *
 * Вся логика маршрутов и payload'ов — здесь. Страницы НЕ знают,
 * как устроен API: они вызывают `getSubscription()`, `createPayment()` и т.д.
 *
 * Если backend использует другие пути — правьте ТОЛЬКО этот файл.
 *
 * ── Маршруты ──────────────────────────────────────────────────────────────
 *  GET    /health                          (без авторизации)  smoke-check
 *  GET    /me                              текущий пользователь
 *  GET    /subscription                    подписка
 *  GET    /plans                           тарифы + цены
 *  POST   /payments/create                 создать заказ { planId }
 *  GET    /payments/:id/status             статус оплаты (поллинг)
 *  GET    /vpn/config                      VPN-конфигурация
 *  GET    /referrals/stats                 рефералы + кошелёк
 *  POST   /withdrawals/create              заявка на вывод
 *
 * Все защищённые маршруты аутентифицируются заголовком
 * `X-Telegram-Init-Data`. Ни один из них не принимает userId.
 */

import type {
  CreateWithdrawalPayload,
  CreateWithdrawalResult,
  HealthResponse,
  Order,
  PaymentStatus,
  Plan,
  Profile,
  ReferralStats,
  Subscription,
  User,
  VpnConfigResponse,
} from '@/types';
import { APP_CONFIG } from '@/config/app';
import { http } from './client';
import {
  normalizeOrder,
  normalizePaymentStatus,
  normalizePlans,
  normalizeProfile,
  normalizeReferralStats,
  normalizeSubscription,
  normalizeUser,
  normalizeVpnConfigResponse,
  isRecord,
  pick,
  asString,
  asNumber,
} from './normalize';

/* ── Мок для локальной разработки ────────────────────────────────────────
   Подключается ТОЛЬКО при import.meta.env.DEV, поэтому в production-бандл
   модуль не попадает (мёртвый код вырезается на этапе сборки).           */

function mockEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK_API === 'true';
}

async function loadMock() {
  return import('./mock');
}

/* ── Health ────────────────────────────────────────────────────────────── */

/** Публичные параметры приложения: минимальная сумма вывода, валюта и т.п. */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  if (mockEnabled()) return (await loadMock()).getHealth();

  const raw = await http.get<unknown>('/health', { anonymous: true, signal });
  if (!isRecord(raw)) {
    return {
      ok: true,
      version: 'unknown',
      app: {
        name: APP_CONFIG.name,
        minWithdrawalAmount: 50000,
        currency: 'RUB',
        supportUsername: null,
        paymentProviders: [],
      },
    };
  }

  const app = pick(raw, 'app', 'config', 'settings') ?? {};
  return {
    ok: raw.ok !== false,
    version: asString(pick(raw, 'version'), 'unknown'),
    app: {
      name: asString(pick(app, 'name'), 'VPN'),
      minWithdrawalAmount: asNumber(pick(app, 'minWithdrawalAmount', 'min_withdrawal_amount'), 50000),
      currency: asString(pick(app, 'currency'), 'RUB'),
      supportUsername:
        typeof pick(app, 'supportUsername', 'support_username') === 'string'
          ? (pick(app, 'supportUsername', 'support_username') as string)
          : null,
      paymentProviders: Array.isArray(pick(app, 'paymentProviders', 'payment_providers'))
        ? (pick(app, 'paymentProviders', 'payment_providers') as unknown[]).map(String)
        : [],
    },
  };
}

/* ── Пользователь ──────────────────────────────────────────────────────── */

/**
 * Текущий пользователь по подписанной initData.
 * Отдельный /auth/login НЕ нужен: backend аутентифицирует по initData
 * при каждом запросе (stateless). Это убирает окно, в котором сессия
 * могла бы «протухнуть» перед первым запросом.
 */
export async function getMe(signal?: AbortSignal): Promise<User> {
  if (mockEnabled()) return (await loadMock()).getMe();
  const raw = await http.get<unknown>('/me', { signal });
  return normalizeUser(raw);
}

/* ── Подписка ──────────────────────────────────────────────────────────── */

export async function getSubscription(signal?: AbortSignal): Promise<Subscription> {
  if (mockEnabled()) return (await loadMock()).getSubscription();
  const raw = await http.get<unknown>('/subscription', { signal });
  return normalizeSubscription(raw);
}

/** Полный профиль одним запросом (экономит round-trip на экране «Профиль»). */
export async function getProfile(signal?: AbortSignal): Promise<Profile> {
  if (mockEnabled()) return (await loadMock()).getProfile();
  const raw = await http.get<unknown>('/me/profile', { signal });
  return normalizeProfile(raw);
}

/* ── Тарифы ────────────────────────────────────────────────────────────── */

/**
 * Тарифы и цены. ФРОНТЕНД НИКОГДА не хардкодит цену — только показывает
 * то, что вернул сервер (ТЗ п. 31).
 */
export async function getPlans(signal?: AbortSignal): Promise<Plan[]> {
  if (mockEnabled()) return (await loadMock()).getPlans();
  const raw = await http.get<unknown>('/plans', { signal });
  return normalizePlans(raw);
}

/* ── Оплата ────────────────────────────────────────────────────────────── */

/**
 * Создать заказ. Отправляем ТОЛЬКО planId.
 * Сумму не передаём — backend возьмёт цену из своей БД по planId,
 * поэтому клиент не может подделать стоимость.
 *
 * Backend сам понимает, новая это подписка или продление существующей.
 */
export async function createPayment(planId: string, signal?: AbortSignal): Promise<Order> {
  if (mockEnabled()) return (await loadMock()).createPayment(planId);

  const raw = await http.post<unknown>(
    '/payments/create',
    { planId },
    { timeoutMs: 25000, signal },
  );

  // Некоторые backend'ы кладут заказ в поле `order`.
  const orderSource = isRecord(raw) ? (pick(raw, 'order', 'payment') ?? raw) : raw;
  return normalizeOrder(orderSource);
}

/**
 * Статус оплаты. Единственный источник истины — backend, который выставляет
 * `paid` только по webhook'у провайдера. Фронтенд лишь опрашивает.
 */
export async function getPaymentStatus(orderId: string, signal?: AbortSignal): Promise<PaymentStatus> {
  if (mockEnabled()) return (await loadMock()).getPaymentStatus(orderId);

  const raw = await http.get<unknown>(`/payments/${encodeURIComponent(orderId)}/status`, { signal });
  return normalizePaymentStatus(raw);
}

/* ── VPN ───────────────────────────────────────────────────────────────── */

/**
 * VPN-конфигурация.
 *
 * ⚠️ Ответ содержит приватную конфигурацию (`vless://…`).
 *    Она живёт ТОЛЬКО в памяти компонента: не попадает в URL, историю,
 *    localStorage/sessionStorage и логи (см. lib/logger.ts).
 */
export async function getVpnConfig(signal?: AbortSignal): Promise<VpnConfigResponse> {
  if (mockEnabled()) return (await loadMock()).getVpnConfig();
  const raw = await http.get<unknown>('/vpn/config', { signal });
  return normalizeVpnConfigResponse(raw);
}

/* ── Рефералы и кошелёк ────────────────────────────────────────────────── */

/** Баланс берётся у backend. Frontend его не вычисляет и не копит (ТЗ п. 14). */
export async function getReferralStats(signal?: AbortSignal): Promise<ReferralStats> {
  if (mockEnabled()) return (await loadMock()).getReferralStats();
  const raw = await http.get<unknown>('/referrals/stats', { signal });
  return normalizeReferralStats(raw);
}

/**
 * Создать заявку на вывод.
 * `amount` — в копейках. Backend самостоятельно проверяет минимальную сумму,
 * наличие средств и отсутствие других pending-заявок.
 */
export async function createWithdrawal(
  payload: CreateWithdrawalPayload,
  signal?: AbortSignal,
): Promise<CreateWithdrawalResult> {
  if (mockEnabled()) return (await loadMock()).createWithdrawal(payload);

  const raw = await http.post<unknown>(
    '/withdrawals/create',
    { amount: payload.amount, requisites: payload.requisites },
    { signal },
  );

  const source = isRecord(raw) ? (pick(raw, 'withdrawal', 'result') ?? raw) : raw;
  const withdrawalRaw = isRecord(source) ? (pick(source, 'withdrawal') ?? source) : source;
  const referral = isRecord(source) ? pick(source, 'referral') : null;

  return {
    withdrawal: normalizeReferralStats({ withdrawals: [withdrawalRaw] }).withdrawals[0] ?? {
      id: '',
      amount: payload.amount,
      status: 'pending',
      requisites: payload.requisites,
      createdAt: new Date().toISOString(),
      processedAt: null,
      rejectionReason: null,
    },
    balance: referral ? normalizeReferralStats(referral).balance : payload.amount,
  };
}

/* ── Агрегаты для главного экрана ──────────────────────────────────────── */

/**
 * Два независимых запроса параллельно: главный экран открывается на одно
 * кадр быстрее. Ошибка одного не роняет другой.
 */
export async function getHomeData(
  signal?: AbortSignal,
): Promise<{ user: User; subscription: Subscription }> {
  if (mockEnabled()) {
    const mock = await loadMock();
    const [user, subscription] = await Promise.all([mock.getMe(), mock.getSubscription()]);
    return { user, subscription };
  }

  const [user, subscription] = await Promise.all([
    getMe(signal),
    getSubscription(signal),
  ]);
  return { user, subscription };
}