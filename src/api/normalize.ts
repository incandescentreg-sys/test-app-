/**
 * Нормализация ответов backend.
 *
 * Существующий VPN-бот может отдавать поля как в camelCase, так и в
 * snake_case. Здесь мы приводим любой вариант к нашим типам, чтобы фронтенд
 * не ломался из-за одного `expire_at` вместо `expiresAt`.
 *
 * Это НЕ бизнес-логика: значения не пересчитываются и не выдумываются,
 * отсутствующее поле остаётся null.
 */

import type {
  Order,
  OrderStatus,
  PaymentStatus,
  Plan,
  Profile,
  ReferralEntry,
  ReferralStats,
  Subscription,
  SubscriptionStatus,
  User,
  VpnConfig,
  VpnConfigResponse,
  Withdrawal,
  WithdrawalStatus,
} from '@/types';

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Берёт первое существующее поле из списка кандидатов. */
export function pick<T = unknown>(src: unknown, ...keys: string[]): T | undefined {
  if (!isRecord(src)) return undefined;
  for (const key of keys) {
    const v = src[key];
    if (v !== undefined && v !== null) return v as T;
  }
  return undefined;
}

export function asString(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

function asNullableString(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number') return String(v);
  return null;
}

export function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asNullableNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = asNumber(v, NaN);
  return Number.isFinite(n) ? n : null;
}

function asBool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return fallback;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Приводит сумму к копейкам, если backend прислал рубли. */
function normalizeAmount(value: unknown, currency: string): number {
  const n = asNumber(value, 0);
  if (n === 0) return 0;
  // Значения меньше 1000 для RUB почти наверняка уже в рублях.
  if (currency === 'RUB' && n > 0 && n < 1000) return Math.round(n * 100);
  return Math.round(n);
}

/* ── User ──────────────────────────────────────────────────────────────── */

export function normalizeUser(raw: unknown): User {
  return {
    id: asNumber(pick(raw, 'id', 'userId', 'user_id', 'telegramId', 'telegram_id'), 0),
    firstName: asString(pick(raw, 'firstName', 'first_name', 'name'), 'Пользователь'),
    lastName: asNullableString(pick(raw, 'lastName', 'last_name')),
    username: asNullableString(pick(raw, 'username')),
    avatarUrl: asNullableString(pick(raw, 'avatarUrl', 'avatar_url', 'photoUrl', 'photo_url')),
    languageCode: asNullableString(pick(raw, 'languageCode', 'language_code', 'lang')),
    createdAt: asString(pick(raw, 'createdAt', 'created_at', 'registeredAt', 'registered_at')),
    referralLink: asString(
      pick(raw, 'referralLink', 'referral_link', 'refLink', 'ref_link', 'inviteLink'),
    ),
    vpnActive: asBool(pick(raw, 'vpnActive', 'vpn_active', 'hasVpn', 'has_vpn'), false),
  };
}

/* ── Subscription ──────────────────────────────────────────────────────── */

const STATUS_ALIASES: Record<string, SubscriptionStatus> = {
  active: 'active',
  valid: 'active',
  running: 'active',
  expiring: 'expiring',
  expiring_soon: 'expiring',
  soon: 'expiring',
  expired: 'expired',
  inactive: 'none',
  none: 'none',
  missing: 'none',
  pending: 'pending',
  creating: 'pending',
  processing: 'pending',
  frozen: 'frozen',
  paused: 'frozen',
  suspended: 'frozen',
};

function normalizeStatus(raw: unknown): SubscriptionStatus {
  const s = asString(raw, 'none').toLowerCase();
  return STATUS_ALIASES[s] ?? 'none';
}

export function normalizeSubscription(raw: unknown): Subscription {
  if (!isRecord(raw)) {
    return {
      status: 'none',
      planId: null,
      planName: null,
      durationDays: null,
      startAt: null,
      expiresAt: null,
      remainingDays: null,
    };
  }

  const durationDays = asNullableNumber(pick(raw, 'durationDays', 'duration_days'));
  const remainingDays = asNullableNumber(pick(raw, 'remainingDays', 'remaining_days', 'daysLeft'));

  return {
    status: normalizeStatus(pick(raw, 'status', 'state')),
    planId: asNullableString(pick(raw, 'planId', 'plan_id', 'tariffId', 'tariff_id')),
    planName: asNullableString(pick(raw, 'planName', 'plan_name', 'tariffName', 'tariff_name', 'plan')),
    durationDays,
    startAt: asNullableString(pick(raw, 'startAt', 'start_at', 'startedAt', 'started_at')),
    expiresAt: asNullableString(
      pick(raw, 'expiresAt', 'expires_at', 'expireAt', 'expire_at', 'validUntil', 'valid_until', 'endDate'),
    ),
    remainingDays,
    autoRenew: asBool(pick(raw, 'autoRenew', 'auto_renew', 'autorenew'), false),
    trafficUsedGb: asNullableNumber(pick(raw, 'trafficUsedGb', 'traffic_used_gb', 'usedGb', 'used_gb')),
    trafficLimitGb: asNullableNumber(
      pick(raw, 'trafficLimitGb', 'traffic_limit_gb', 'limitGb', 'limit_gb'),
    ),
    deviceLimit: asNullableNumber(pick(raw, 'deviceLimit', 'device_limit', 'devices')),
    clientRef: asNullableString(pick(raw, 'clientRef', 'client_ref', 'h1vlessId', 'h1vless_id')),
  };
}

/* ── Plans ─────────────────────────────────────────────────────────────── */

export function normalizePlan(raw: unknown, index: number): Plan {
  const currency = asString(pick(raw, 'currency', 'currencyCode', 'currency_code'), 'RUB');
  const durationDays = asNumber(pick(raw, 'durationDays', 'duration_days', 'days'), 30);

  return {
    id: asString(pick(raw, 'id', 'planId', 'plan_id', 'uuid', 'code'), `plan-${index}`),
    name: asString(pick(raw, 'name', 'title', 'label'), `${durationDays} дней`),
    durationDays,
    price: normalizeAmount(pick(raw, 'price', 'amount', 'cost', 'value'), currency),
    currency,
    pricePerMonth: asNullableNumber(pick(raw, 'pricePerMonth', 'price_per_month', 'perMonth')),
    originalPrice: asNullableNumber(pick(raw, 'originalPrice', 'original_price', 'oldPrice')),
    badge: asNullableString(pick(raw, 'badge', 'tag', 'label_short')),
    description: asNullableString(pick(raw, 'description', 'subtitle')),
    features: asArray(pick(raw, 'features', 'bullets')).map((f) => asString(f)),
    isPopular: asBool(pick(raw, 'isPopular', 'is_popular', 'popular'), false),
    available: asBool(pick(raw, 'available', 'isAvailable', 'enabled'), true),
  };
}

export function normalizePlans(raw: unknown): Plan[] {
  const list = Array.isArray(raw) ? raw : asArray(pick(raw, 'plans', 'items', 'data'));
  return list.map(normalizePlan).filter((p) => p.available !== false);
}

/* ── Order / Payment ───────────────────────────────────────────────────── */

const ORDER_STATUS_ALIASES: Record<string, OrderStatus> = {
  created: 'created',
  new: 'created',
  pending: 'pending',
  awaiting: 'pending',
  processing: 'pending',
  paid: 'paid',
  succeeded: 'paid',
  success: 'paid',
  confirmed: 'paid',
  failed: 'failed',
  error: 'failed',
  declined: 'failed',
  expired: 'expired',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  refund: 'refunded',
  refunded: 'refunded',
};

function normalizeOrderStatus(raw: unknown): OrderStatus {
  const s = asString(raw, 'created').toLowerCase();
  return ORDER_STATUS_ALIASES[s] ?? 'created';
}

export function normalizeOrder(raw: unknown): Order {
  const currency = asString(pick(raw, 'currency'), 'RUB');
  return {
    id: asString(pick(raw, 'id', 'orderId', 'order_id', 'uuid', 'paymentId', 'payment_id')),
    planId: asString(pick(raw, 'planId', 'plan_id')),
    planName: asString(pick(raw, 'planName', 'plan_name', 'plan')),
    durationDays: asNumber(pick(raw, 'durationDays', 'duration_days', 'days'), 0),
    amount: normalizeAmount(pick(raw, 'amount', 'total', 'price', 'sum'), currency),
    currency,
    status: normalizeOrderStatus(pick(raw, 'status', 'state')),
    paymentUrl: asNullableString(
      pick(raw, 'paymentUrl', 'payment_url', 'confirmationUrl', 'confirmation_url', 'redirectUrl', 'redirect_url'),
    ),
    provider: asString(pick(raw, 'provider', 'paymentProvider', 'payment_provider'), ''),
    expiresAt: asString(pick(raw, 'expiresAt', 'expires_at', 'expireAt')),
    createdAt: asString(pick(raw, 'createdAt', 'created_at')),
    paidAt: asNullableString(pick(raw, 'paidAt', 'paid_at')),
  };
}

export function normalizePaymentStatus(raw: unknown): PaymentStatus {
  const status = normalizeOrderStatus(pick(raw, 'status', 'state'));
  return {
    orderId: asString(pick(raw, 'orderId', 'order_id', 'id', 'paymentId')),
    status,
    amount: normalizeAmount(pick(raw, 'amount', 'total', 'price'), 'RUB'),
    currency: asString(pick(raw, 'currency'), 'RUB'),
    paidAt: asNullableString(pick(raw, 'paidAt', 'paid_at')),
    vpnActivated: asBool(pick(raw, 'vpnActivated', 'vpn_activated', 'subscriptionActive'), false),
    subscription: pick(raw, 'subscription') ? normalizeSubscription(pick(raw, 'subscription')) : null,
    failureReason: asNullableString(pick(raw, 'failureReason', 'failure_reason', 'message')),
  };
}

/* ── VPN config ────────────────────────────────────────────────────────── */

export function normalizeVpnConfig(raw: unknown): VpnConfig {
  const subscriptionUrl = asString(
    pick(raw, 'subscriptionUrl', 'subscription_url', 'configUrl', 'config_url', 'url', 'link'),
  );

  return {
    id: asString(pick(raw, 'id', 'configId', 'config_id'), 'vpn'),
    protocol: (asString(pick(raw, 'protocol', 'type'), 'vless').toLowerCase() as VpnConfig['protocol']) || 'vless',
    subscriptionUrl,
    configUrl: subscriptionUrl,
    host: asString(pick(raw, 'host', 'server', 'address', 'domain')),
    port: asNumber(pick(raw, 'port'), 0),
    label: asNullableString(pick(raw, 'label', 'name', 'remark')),
    updatedAt: asString(pick(raw, 'updatedAt', 'updated_at', 'createdAt')),
    expiresAt: asNullableString(pick(raw, 'expiresAt', 'expires_at')),
    botUrl: asNullableString(pick(raw, 'botUrl', 'bot_url', 'tgUrl', 'tg_url')),
  };
}

export function normalizeVpnConfigResponse(raw: unknown): VpnConfigResponse {
  const source = isRecord(raw) ? pick(raw, 'config', 'vpn', 'data') ?? raw : raw;
  const subscriptionSource = isRecord(raw)
    ? pick(raw, 'subscription') ?? pick(source, 'subscription')
    : null;
  const clientsSource = isRecord(raw) ? pick(raw, 'availableClients', 'available_clients', 'clients') : null;

  return {
    config: normalizeVpnConfig(source),
    subscription: normalizeSubscription(subscriptionSource),
    availableClients: asArray(clientsSource).map((c) => ({
      id: asString(pick(c, 'id'), String(pick(c, 'name') ?? '')),
      name: asString(pick(c, 'name', 'title'), 'VPN-клиент'),
      platforms: asArray(pick(c, 'platforms', 'platforms_list', 'platform')).map(
        (p) => String(p).toLowerCase(),
      ) as Array<'ios' | 'android' | 'desktop'>,
      storeUrl: asNullableString(pick(c, 'storeUrl', 'store_url', 'url', 'link')),
      guideUrl: asNullableString(pick(c, 'guideUrl', 'guide_url')),
      icon: asNullableString(pick(c, 'icon', 'emoji')),
    })),
  };
}

/* ── Referrals / Wallet ────────────────────────────────────────────────── */

const WITHDRAWAL_STATUS: Record<string, WithdrawalStatus> = {
  pending: 'pending',
  new: 'pending',
  requested: 'pending',
  approved: 'approved',
  processing: 'approved',
  paid: 'paid',
  done: 'paid',
  completed: 'paid',
  rejected: 'rejected',
  declined: 'rejected',
  failed: 'rejected',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

function normalizeWithdrawal(raw: unknown): Withdrawal {
  return {
    id: asString(pick(raw, 'id', 'withdrawalId', 'withdrawal_id')),
    amount: normalizeAmount(pick(raw, 'amount', 'sum'), 'RUB'),
    status: (WITHDRAWAL_STATUS[asString(pick(raw, 'status'), 'pending').toLowerCase()] ??
      'pending') as WithdrawalStatus,
    requisites: asNullableString(pick(raw, 'requisites', 'details', 'account')),
    createdAt: asString(pick(raw, 'createdAt', 'created_at')),
    processedAt: asNullableString(pick(raw, 'processedAt', 'processed_at')),
    rejectionReason: asNullableString(pick(raw, 'rejectionReason', 'rejection_reason')),
  };
}

export function normalizeReferralStats(raw: unknown): ReferralStats {
  const currency = asString(pick(raw, 'currency'), 'RUB');
  const source = isRecord(raw) ? pick(raw, 'stats', 'data') ?? raw : raw;

  return {
    invitedCount: asNumber(pick(source, 'invitedCount', 'invited_count', 'referralsCount', 'total'), 0),
    activeCount: asNumber(pick(source, 'activeCount', 'active_count', 'active'), 0),
    totalEarnings: normalizeAmount(
      pick(source, 'totalEarnings', 'total_earnings', 'earned', 'totalEarned'),
      currency,
    ),
    balance: normalizeAmount(pick(source, 'balance', 'available', 'availableBalance', 'wallet'), currency),
    pendingEarnings: asNullableNumber(pick(source, 'pendingEarnings', 'pending_earnings')),
    bonusPercent: asNumber(pick(source, 'bonusPercent', 'bonus_percent', 'percent', 'reward'), 0),
    currency,
    referralLink: asString(
      pick(source, 'referralLink', 'referral_link', 'refLink', 'ref_link', 'inviteLink'),
    ),
    recent: asArray(pick(source, 'recent', 'referrals', 'invited')).map(
      (r): ReferralEntry => ({
        userId: asNumber(pick(r, 'userId', 'user_id', 'id'), 0),
        displayName: asString(
          pick(r, 'displayName', 'display_name', 'firstName', 'first_name', 'name'),
          'Пользователь',
        ),
        username: asNullableString(pick(r, 'username')),
        avatarUrl: asNullableString(pick(r, 'avatarUrl', 'avatar_url', 'photoUrl', 'photo_url')),
        earned: normalizeAmount(pick(r, 'earned', 'bonus', 'reward'), currency),
        credited: asBool(pick(r, 'credited', 'isCredited', 'is_credited'), false),
        registeredAt: asString(pick(r, 'registeredAt', 'registered_at', 'createdAt', 'created_at')),
      }),
    ),
    withdrawals: asArray(pick(source, 'withdrawals', 'withdrawalHistory', 'payouts')).map(
      normalizeWithdrawal,
    ),
  };
}

/* ── Profile ───────────────────────────────────────────────────────────── */

export function normalizeProfile(raw: unknown): Profile {
  const source = isRecord(raw) ? raw : {};
  const user = normalizeUser(pick(source, 'user', 'me') ?? source);
  const referral = normalizeReferralStats(pick(source, 'referral', 'referrals', 'wallet') ?? {});
  const stats = pick(source, 'stats', 'statistics') ?? {};

  return {
    user: {
      ...user,
      referralLink: user.referralLink || referral.referralLink,
    },
    subscription: normalizeSubscription(pick(source, 'subscription')),
    referral,
    stats: {
      totalPaid: normalizeAmount(pick(stats, 'totalPaid', 'total_paid', 'paid'), 'RUB'),
      purchaseCount: asNumber(pick(stats, 'purchaseCount', 'purchase_count', 'orders'), 0),
      firstPurchaseAt: asNullableString(pick(stats, 'firstPurchaseAt', 'first_purchase_at')),
    },
  };
}