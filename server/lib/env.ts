/**
 * Доступ к переменным окружения.
 *
 * Правило: секреты читаются ТОЛЬКО здесь и ТОЛЬКО на сервере.
 * Во фронтенде (`src/`) не должно быть ни одного обращения к process.env.
 */

/** Обязательная переменная: без неё сервер не должен работать. */
export function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Отсутствует обязательная переменная окружения: ${name}`);
  }
  return value.trim();
}

function optional(name: string, fallback = ''): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback = false): boolean {
  const raw = optional(name).toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return fallback;
}

/* ── Telegram ────────────────────────────────────────────────────────────── */

/** Токен бота. Секрет: только в env backend, никогда во фронтенде. */
export const BOT_TOKEN = (): string => required('BOT_TOKEN');

/**
 * Запасные токены бота через запятую.
 *
 * Нужны для ротации без простоя. Telegram подписывает initData тем токеном,
 * который выдал последним, а если сервер знает только предыдущий, все
 * открытые приложения получают «сессия истекла». Список снимает проблему:
 * при смене токена достаточно дописать новый, старый можно убрать позже.
 */
export const BOT_TOKEN_FALLBACKS = (): string[] =>
  optional('BOT_TOKEN_FALLBACKS')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value !== BOT_TOKEN());

/** Username бота без @ — для сборки реферальных ссылок. */
export const BOT_USERNAME = (): string => optional('BOT_USERNAME', 'YablokoVPNBot').replace(/^@/, '');

/** Максимальный возраст initData. Старше суток — сессия считается истёкшей. */
export const INIT_DATA_MAX_AGE_SEC = (): number => num('INIT_DATA_MAX_AGE_SEC', 86_400);

/* ── H1VLESS ─────────────────────────────────────────────────────────────── */

/** База API панели, например http://nl6.h1cloud.net:25108 */
export const H1VLESS_BASE_URL = (): string =>
  optional('H1VLESS_BASE_URL', 'http://nl6.h1cloud.net:25108').replace(/\/+$/, '');

/**
 * Готовый токен панели. Если задан — логин не нужен.
 * Получить можно один раз вручную: POST /auth/login.
 */
export const H1VLESS_TOKEN = (): string => optional('H1VLESS_TOKEN');

/** Логин/пароль админа панели — используются, только если токена нет. */
export const H1VLESS_USERNAME = (): string => optional('H1VLESS_USERNAME');
export const H1VLESS_PASSWORD = (): string => optional('H1VLESS_PASSWORD');

/** Префикс имени клиента в панели. По умолчанию tg<userId> — как уже настроено. */
export const H1VLESS_NAME_PREFIX = (): string => optional('H1VLESS_CLIENT_PREFIX', 'tg');

/** Таймаут запроса к панели, мс. Панель локальная по NAT, задержка мала. */
export const H1VLESS_TIMEOUT_MS = num('H1VLESS_TIMEOUT_MS', 12_000);

/** Разрешено ли банить клиента в панели при отзыве доступа. */
export const H1VLESS_BAN_ON_REVOKE = (): boolean => bool('H1VLESS_BAN_ON_REVOKE', true);

/* ── Приложение ──────────────────────────────────────────────────────────── */

export const APP_NAME = (): string => optional('APP_NAME', 'Яблоко VPN');
export const SUPPORT_USERNAME = (): string => optional('SUPPORT_USERNAME', '').replace(/^@/, '');
export const CURRENCY = (): string => optional('CURRENCY', 'RUB');

/** Минимальная сумма вывода в копейках. Фронт берёт это значение из /health. */
export const MIN_WITHDRAWAL_AMOUNT = (): number => num('MIN_WITHDRAWAL_AMOUNT', 50_000);

/** Процент реферального бонуса с покупки приглашённого. */
export const REFERRAL_BONUS_PERCENT = (): number => num('REFERRAL_BONUS_PERCENT', 20);

/** Сколько дней до истечения считать «скоро истекает». */
export const EXPIRING_SOON_DAYS = (): number => num('EXPIRING_SOON_DAYS', 5);

/** Лимит устройств по умолчанию (0 = без лимита, панель сама не считает). */
export const DEVICE_LIMIT = (): number => num('DEVICE_LIMIT', 0);

/** Лимит трафика в ГБ по умолчанию (0 = без лимита). */
export const TRAFFIC_LIMIT_GB = (): number => num('TRAFFIC_LIMIT_GB', 0);

/* ── Платежи ─────────────────────────────────────────────────────────────── */

/**
 * Включён ли приём платежей.
 *
 * Пока выключено — POST /payments/create отвечает 503 с понятным кодом,
 * а тарифы и весь остальной функционал продолжают работать.
 */
export const PAYMENTS_ENABLED = (): boolean => bool('PAYMENTS_ENABLED', false);

/** Секрет для webhook'а платёжного провайдера (или служебной кнопки «выдать подписку»). */
export const WEBHOOK_SECRET = (): string => optional('WEBHOOK_SECRET');

/**
 * Секрет служебного маршрута /api/admin/provision.
 * Пока не задан, маршрут закрыт целиком.
 */
export const ADMIN_SECRET = (): string => optional('ADMIN_SECRET');

/** Сколько живёт заказ в ожидании оплаты. */
export const ORDER_TTL_MINUTES = (): number => num('ORDER_TTL_MINUTES', 30);

/**
 * Временная отладка проверки initData.
 *
 * Пишет в лог data_check_string вместе с полученным hash: без этого
 * перебор вариантов строки невозможен. Сама строка секретом не является —
 * подписать что-то новое всё равно нельзя, нужен токен бота.
 *
 * После разбора проблемы переменную нужно снять с прода.
 */
export const DEBUG_INITDATA = (): boolean => bool('DEBUG_INITDATA', false);

/* ── CORS ────────────────────────────────────────────────────────────────── */

/**
 * Домены, которым разрешён кросс-доменный доступ.
 * По умолчанию пусто: Mini App и backend на одном домене, CORS не нужен.
 */
export const ALLOWED_ORIGINS = (): string[] =>
  optional('ALLOWED_ORIGINS')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);