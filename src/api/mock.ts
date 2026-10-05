/**
 * Мок-API для локальной разработки в обычном браузере.
 *
 * ВАЖНО:
 *  • Подключается ТОЛЬКО при `import.meta.env.DEV` + VITE_ENABLE_MOCK_API=true.
 *  • Физически вырезается из production-бандла (мёртвый код).
 *  • Не содержит и не может содержать реальных секретов или конфигураций.
 *
 * Нужен, чтобы верстать UI без Telegram и без backend.
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
import { formatDateCompact } from '@/lib/format';

const LATENCY_MIN = 280;
const LATENCY_MAX = 780;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const latency = () => wait(LATENCY_MIN + Math.random() * (LATENCY_MAX - LATENCY_MIN));

const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const daysAhead = (n: number) => new Date(Date.now() + n * 86400000);

/* ── Состояние мока ────────────────────────────────────────────────────── */

interface MockState {
  /** Сколько раз опрашивали статус заказа — имитируем задержку webhook'а. */
  polls: Map<string, number>;
  hasSubscription: boolean;
  subscription: Subscription;
  balanceMinor: number;
  orders: Map<string, Order>;
  withdrawals: ReferralStats['withdrawals'];
}

const MOCK_USER_ID = 777000001;

const state: MockState = {
  polls: new Map(),
  hasSubscription: false,
  subscription: {
    status: 'none',
    planId: null,
    planName: null,
    durationDays: null,
    startAt: null,
    expiresAt: null,
    remainingDays: null,
  },
  balanceMinor: 89000,
  orders: new Map(),
  withdrawals: [],
};

/** Первая загрузка — без подписки, чтобы увидеть empty state. */
export function resetMockState(withSubscription = false): void {
  state.hasSubscription = withSubscription;
  state.orders.clear();
  state.polls.clear();
  if (withSubscription) {
    state.subscription = {
      status: 'active',
      planId: 'plan-1m',
      planName: '1 месяц',
      durationDays: 30,
      startAt: iso(daysAgo(6)),
      expiresAt: iso(daysAhead(24)),
      remainingDays: 24,
      trafficUsedGb: 42.5,
      trafficLimitGb: null,
      deviceLimit: 5,
    };
  } else {
    state.subscription = {
      status: 'none',
      planId: null,
      planName: null,
      durationDays: null,
      startAt: null,
      expiresAt: null,
      remainingDays: null,
    };
  }
}

resetMockState(false);

const referralLink = `https://t.me/VPNDemoBot?start=ref_${MOCK_USER_ID}`;

/* ── Handlers ──────────────────────────────────────────────────────────── */

export async function getHealth(): Promise<HealthResponse> {
  await latency();
  return {
    ok: true,
    version: 'mock-1.0.0',
    app: {
      name: 'Яблоко VPN',
      minWithdrawalAmount: 50000,
      currency: 'RUB',
      supportUsername: 'YourSupportBot',
      paymentProviders: ['mock'],
    },
  };
}

export async function getMe(): Promise<User> {
  await latency();
  return {
    id: MOCK_USER_ID,
    firstName: 'Демо',
    lastName: 'Пользователь',
    username: 'demo_user',
    avatarUrl: null,
    languageCode: 'ru',
    createdAt: iso(daysAgo(48)),
    referralLink,
    vpnActive: state.hasSubscription,
  };
}

export async function getSubscription(): Promise<Subscription> {
  await latency();
  return state.subscription;
}

export async function getProfile(): Promise<Profile> {
  await latency();
  const user = await getMe();
  return {
    user: { ...user, vpnActive: state.hasSubscription },
    subscription: state.subscription,
    referral: await getReferralStats(),
    stats: {
      totalPaid: state.hasSubscription ? 79900 : 0,
      purchaseCount: state.hasSubscription ? 1 : 0,
      firstPurchaseAt: state.hasSubscription ? iso(daysAgo(48)) : null,
    },
  };
}

export async function getPlans(): Promise<Plan[]> {
  await latency();
  // ⚠️ ЭТО ТОЛЬКО МОК ДЛЯ ЛОКАЛЬНОЙ РАЗРАБОТКИ.
  // Боевые цены всегда приходят из GET /api/plans (ТЗ п. 31).
  // Менять их здесь нужно только чтобы верстать UI без backend.
  return [
    {
      id: 'plan-1m',
      name: '1 месяц',
      durationDays: 30,
      price: 14900, // 149 ₽
      currency: 'RUB',
      pricePerMonth: 14900, // 149 ₽ / мес
      originalPrice: null,
      badge: null,
      description: 'Быстрый старт',
      isPopular: false,
      available: true,
    },
    {
      id: 'plan-3m',
      name: '3 месяца',
      durationDays: 90,
      price: 41900, // 419 ₽
      currency: 'RUB',
      pricePerMonth: 13967, // ≈ 139,67 ₽ / мес (−6%)
      originalPrice: 44700, // 3 × 149 ₽ — основа для показа выгоды
      badge: 'Выгодно',
      description: 'Оптимальный выбор',
      isPopular: true,
      available: true,
    },
    {
      id: 'plan-6m',
      name: '6 месяцев',
      durationDays: 180,
      price: 71900, // 719 ₽
      currency: 'RUB',
      pricePerMonth: 11983, // ≈ 119,83 ₽ / мес (−20%)
      originalPrice: 89400, // 6 × 149 ₽
      badge: '−20%',
      description: 'Максимальная выгода',
      isPopular: false,
      available: true,
    },
  ];
}

export async function createPayment(planId: string): Promise<Order> {
  await latency();
  const plans = await getPlans();
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  if (!plan) throw new Error('Тариф не найден');

  const id = `mock_order_${Date.now().toString(36)}`;
  const order: Order = {
    id,
    planId: plan.id,
    planName: plan.name,
    durationDays: plan.durationDays,
    amount: plan.price,
    currency: plan.currency,
    status: 'pending',
    paymentUrl: 'https://telegram.org',
    provider: 'mock',
    expiresAt: iso(new Date(Date.now() + 15 * 60000)),
    createdAt: iso(new Date()),
    paidAt: null,
  };

  state.orders.set(id, order);
  state.polls.set(id, 0);
  return order;
}

export async function getPaymentStatus(orderId: string): Promise<PaymentStatus> {
  await latency();

  const order = state.orders.get(orderId);
  if (!order) throw new Error('Заказ не найден');

  const polls = (state.polls.get(orderId) ?? 0) + 1;
  state.polls.set(orderId, polls);

  // Имитируем webhook провайдера: оплата проходит на 3-м опросе.
  const PAID_AFTER_POLLS = 3;
  if (polls >= PAID_AFTER_POLLS) {
    const updated: Order = { ...order, status: 'paid', paidAt: iso(new Date()) };
    state.orders.set(orderId, updated);

    // Продление или новая подписка — определяем по текущему состоянию.
    const isRenewal = state.hasSubscription && state.subscription.status !== 'none';
    const newStart = isRenewal ? state.subscription.startAt : iso(new Date());
    const newEnd = isRenewal && state.subscription.expiresAt
      ? iso(new Date(new Date(state.subscription.expiresAt).getTime() + order.durationDays * 86400000))
      : iso(daysAhead(order.durationDays));

    state.hasSubscription = true;
    state.subscription = {
      status: 'active',
      planId: order.planId,
      planName: order.planName,
      durationDays: order.durationDays,
      startAt: newStart,
      expiresAt: newEnd,
      remainingDays: Math.max(
        0,
        Math.round((new Date(newEnd).getTime() - Date.now()) / 86400000),
      ),
      trafficUsedGb: 0,
      trafficLimitGb: null,
      deviceLimit: 5,
    };

    return {
      orderId,
      status: 'paid',
      amount: order.amount,
      currency: order.currency,
      paidAt: updated.paidAt,
      vpnActivated: true,
      subscription: state.subscription,
      failureReason: null,
    };
  }

  return {
    orderId,
    status: 'pending',
    amount: order.amount,
    currency: order.currency,
    paidAt: null,
    vpnActivated: false,
    subscription: null,
    failureReason: null,
  };
}

export async function getVpnConfig(): Promise<VpnConfigResponse> {
  await latency();

  if (!state.hasSubscription) {
    throw Object.assign(new Error('Подписка не найдена'), { status: 404, code: 'SUBSCRIPTION_NOT_FOUND' });
  }

  const expires = state.subscription.expiresAt ?? iso(daysAhead(30));

  return {
    config: {
      id: 'mock-config',
      protocol: 'vless',
      // Явно помечено как нерабочее — никаких реальных серверов.
      subscriptionUrl: `vless://demo-uuid@mock.invalid:25201?type=tcp&security=reality&sni=www.samsung.com&sid=8cf81f61&fp=chrome&flow=xtls-rprx-vision#MOCK-NOT-A-REAL-SERVER`,
      configUrl: '',
      host: 'mock.invalid',
      port: 25201,
      label: 'Основной сервер',
      updatedAt: iso(new Date()),
      expiresAt: expires,
      botUrl: null,
    },
    subscription: state.subscription,
    availableClients: [],
  };
}

export async function getReferralStats(): Promise<ReferralStats> {
  await latency();
  return {
    invitedCount: 12,
    activeCount: 7,
    totalEarnings: 149000,
    balance: state.balanceMinor,
    pendingEarnings: 12000,
    bonusPercent: 20,
    currency: 'RUB',
    referralLink,
    recent: Array.from({ length: 4 }, (_, i) => ({
      userId: 9000 + i,
      displayName: ['Анна', 'Дмитрий', 'Ольга', 'Максим'][i] ?? 'Друг',
      username: null,
      avatarUrl: null,
      earned: [29900, 79900, 14900, 29900][i] ?? 29900,
      credited: i < 3,
      registeredAt: iso(daysAgo(i * 4 + 1)),
    })),
    withdrawals: state.withdrawals,
  };
}

export async function createWithdrawal(
  payload: CreateWithdrawalPayload,
): Promise<CreateWithdrawalResult> {
  await latency();

  if (payload.amount < 50000) {
    throw Object.assign(new Error('Минимальная сумма вывода — 500 ₽.'), {
      status: 400,
      code: 'MIN_WITHDRAWAL_NOT_REACHED',
    });
  }
  if (payload.amount > state.balanceMinor) {
    throw Object.assign(new Error('Недостаточно средств на балансе.'), {
      status: 400,
      code: 'BALANCE_TOO_LOW',
    });
  }
  if (payload.requisites.trim().length < 5) {
    throw Object.assign(new Error('Укажите корректные реквизиты.'), {
      status: 400,
      code: 'INVALID_REQUISITES',
    });
  }

  const withdrawal = {
    id: `mock_wd_${Date.now().toString(36)}`,
    amount: payload.amount,
    status: 'pending' as const,
    requisites: payload.requisites,
    createdAt: iso(new Date()),
    processedAt: null,
    rejectionReason: null,
  };

  state.withdrawals = [withdrawal, ...state.withdrawals];
  state.balanceMinor -= payload.amount;

  return { withdrawal, balance: state.balanceMinor };
}

/** Утилита для консоли разработчика. */
export function mockHelpers() {
  return {
    activate: () => resetMockState(true),
    deactivate: () => resetMockState(false),
    setBalance: (minor: number) => {
      state.balanceMinor = minor;
    },
    expiresAt: () => formatDateCompact(state.subscription.expiresAt),
  };
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __vpnMock?: unknown }).__vpnMock = mockHelpers();
}