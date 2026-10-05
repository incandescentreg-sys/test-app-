/**
 * Доменные типы фронтенда.
 *
 * ВАЖНО: это ТИПЫ ОТВЕТОВ BACKEND, а не источник истины.
 * Фронтенд никогда не вычисляет цену, баланс, статус оплаты или срок
 * подписки самостоятельно — он только отображает то, что вернул сервер.
 */

/* ── Пользователь ───────────────────────────────────────────────────────── */

export interface User {
  /** Telegram user id. Приходит с backend — клиент его не придумывает. */
  id: number;
  firstName: string;
  lastName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  languageCode?: string | null;
  createdAt: string;
  /** Готовая реферальная ссылка, собранная backend. */
  referralLink: string;
  vpnActive: boolean;
}

export interface AuthSession {
  user: User;
  /** Не секрет — просто признак, что backend доверяет этому устройству. */
  issuedAt: string;
}

/* ── Тарифы ────────────────────────────────────────────────────────────── */

export interface Plan {
  id: string;
  name: string;
  durationDays: number;
  /** Цена В КОПЕЙКАХ (целое число) — так надёжнее, чем float. */
  price: number;
  currency: string;
  /** Цена за месяц, если backend её рассчитывает. */
  pricePerMonth?: number | null;
  originalPrice?: number | null;
  /** Короткая метка: «Выгодно», «−20%». */
  badge?: string | null;
  description?: string | null;
  features?: string[] | null;
  isPopular?: boolean;
  available?: boolean;
}

/* ── Подписка ───────────────────────────────────────────────────────────── */

export type SubscriptionStatus =
  | 'active'
  | 'expiring'
  | 'expired'
  | 'none'
  | 'pending'
  | 'frozen';

export interface Subscription {
  status: SubscriptionStatus;
  planId: string | null;
  planName: string | null;
  durationDays: number | null;
  startAt: string | null;
  /** Дата истечения. */
  expiresAt: string | null;
  /** Сколько дней осталось — считает backend, не фронтенд. */
  remainingDays: number | null;
  autoRenew?: boolean;
  trafficUsedGb?: number | null;
  trafficLimitGb?: number | null;
  deviceLimit?: number | null;
  /** Внутренний идентификатор H1VLESS-клиента. Показываем только в debug. */
  clientRef?: string | null;
}

/* ── Оплата ─────────────────────────────────────────────────────────────── */

export type OrderStatus =
  | 'created'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'cancelled';

export interface Order {
  id: string;
  planId: string;
  planName: string;
  durationDays: number;
  /** Сумма, зафиксированная backend'ом. */
  amount: number;
  currency: string;
  status: OrderStatus;
  /** Куда уводить пользователя для оплаты. */
  paymentUrl: string | null;
  provider: string;
  /** Когда истекает ссылка на оплату. */
  expiresAt: string;
  createdAt: string;
  paidAt?: string | null;
}

export interface PaymentStatus {
  orderId: string;
  status: OrderStatus;
  amount: number;
  currency: string;
  paidAt?: string | null;
  /** Backend сообщает, активировался ли VPN после оплаты. */
  vpnActivated: boolean;
  subscription?: Subscription | null;
  /** Что показать пользователю, если что-то пошло не так. */
  failureReason?: string | null;
}

/* ── VPN конфигурация ───────────────────────────────────────────────────── */

export type VpnProtocol = 'vless' | 'vmess' | 'trojan' | 'shadowsocks';

export interface VpnConfig {
  id: string;
  protocol: VpnProtocol;
  /** Чистая конфигурация — живёт только в памяти, НЕ в URL и НЕ в localStorage. */
  subscriptionUrl: string;
  /** Устаревшее имя для совместимости с разными backend'ами. */
  configUrl?: string;
  host: string;
  port: number;
  label?: string | null;
  updatedAt: string;
  expiresAt?: string | null;
  /** Ссылка на Telegram-бот, если провайдер так отдаёт. */
  botUrl?: string | null;
}

export interface VpnConfigResponse {
  config: VpnConfig;
  subscription: Subscription;
  /** Человекочитаемые подсказки для экрана конфигурации. */
  availableClients: VpnClient[];
}

export interface VpnClient {
  id: string;
  name: string;
  platforms: ('ios' | 'android' | 'desktop')[];
  storeUrl: string | null;
  guideUrl?: string | null;
  icon?: string | null;
}

/* ── Рефералы и кошелёк ─────────────────────────────────────────────────── */

export interface ReferralEntry {
  userId: number;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  /** Сумма, начисленная с покупки этого пользователя. */
  earned: number;
  /** Зачислен ли бонус на баланс. */
  credited: boolean;
  registeredAt: string;
}

export type WithdrawalStatus =
  | 'pending'
  | 'approved'
  | 'paid'
  | 'rejected'
  | 'cancelled';

export interface Withdrawal {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  /** Реквизиты — не показываем в списке полностью. */
  requisites?: string | null;
  createdAt: string;
  processedAt?: string | null;
  rejectionReason?: string | null;
}

export interface ReferralStats {
  /** Приглашено всего. */
  invitedCount: number;
  /** Из них с активной подпиской. */
  activeCount: number;
  /** Всего заработано за всё время. */
  totalEarnings: number;
  /** Доступно к выводу прямо сейчас. */
  balance: number;
  /** В ожидании (не ушёл холд). */
  pendingEarnings?: number | null;
  /** Бонус с покупки приглашённого, в процентах. */
  bonusPercent: number;
  currency: string;
  /** Ссылка для «Поделиться». Готовая от backend. */
  referralLink: string;
  recent: ReferralEntry[];
  withdrawals: Withdrawal[];
}

export interface CreateWithdrawalPayload {
  amount: number;
  requisites: string;
}

export interface CreateWithdrawalResult {
  withdrawal: Withdrawal;
  balance: number;
}

/* ── Профиль ───────────────────────────────────────────────────────────── */

export interface Profile {
  user: User;
  subscription: Subscription;
  referral: ReferralStats;
  stats: {
    totalPaid: number;
    purchaseCount: number;
    firstPurchaseAt: string | null;
  };
}

/* ── Служебное ──────────────────────────────────────────────────────────── */

export interface HealthResponse {
  ok: boolean;
  version: string;
  /** Публичные, несекретные параметры приложения. */
  app: {
    name: string;
    minWithdrawalAmount: number;
    currency: string;
    supportUsername: string | null;
    paymentProviders: string[];
  };
}

/** Ошибка API в нормализованном виде. */
export interface ApiErrorShape {
  message: string;
  status: number;
  code?: string;
  details?: unknown;
}