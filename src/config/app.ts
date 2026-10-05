/**
 * Конфигурация приложения.
 *
 * Всё, что может поменяться без правки кода (ссылки, тексты, инструкция,
 * параметры чекаута), собрано здесь. См. пункт 11 ТЗ: «Добавь возможность
 * заменить инструкции в одном месте через конфигурацию проекта».
 */

const env = import.meta.env;

const trimSlash = (v: string | undefined): string => (v ?? '').replace(/\/+$/, '');

export const APP_CONFIG = {
  name: 'Яблоко VPN',
  tagline: 'Безопасный интернет в один клик',
  version: env.VITE_APP_VERSION ?? '1.0.0',

  /** База API. По умолчанию — тот же домен (папка /api на Vercel). */
  apiBaseUrl: trimSlash(env.VITE_API_BASE_URL || '/api') || '/api',

  botUsername: (env.VITE_BOT_USERNAME ?? '').replace(/^@/, ''),

  support: {
    url: env.VITE_SUPPORT_URL ?? '',
    username: (env.VITE_SUPPORT_USERNAME ?? '').replace(/^@/, ''),
  },

  privacyUrl: env.VITE_PRIVACY_URL ?? '',

  /** Таймауты запросов, мс. */
  timeouts: {
    default: 15000,
    paymentCreate: 25000,
  },

  /** Поллинг статуса оплата, мс. */
  paymentPolling: {
    intervalMs: 3000,
    /** 3с × 40 ≈ 2 минуты — столько ждём webhook от провайдера. */
    maxAttempts: 40,
  },

  /** Сколько дней считать «скоро истекает». */
  expiringSoonDays: 5,

  currency: 'RUB',
} as const;

/* ── Преимущества (п. 4) ────────────────────────────────────────────────── */

export interface Feature {
  icon: 'bolt' | 'lock' | 'globe' | 'devices';
  emoji: string;
  title: string;
}

export const FEATURES: Feature[] = [
  { icon: 'bolt', emoji: '⚡', title: 'Быстрое подключение' },
  { icon: 'lock', emoji: '🔒', title: 'Защита соединения' },
  { icon: 'globe', emoji: '🌍', title: 'Доступ к интернету' },
  { icon: 'devices', emoji: '📱', title: 'Все устройства' },
];

/* ── Приложения для инструкции ──────────────────────────────────────────── */

export type AppPlatform = 'ios' | 'android' | 'desktop' | 'all';

export interface VpnAppLink {
  id: string;
  name: string;
  note: string;
  /** Короткая метка платформы для группировки. */
  platform: AppPlatform;
  storeUrl: string | null;
  /** Небольшая иконка-эмодзи. */
  emoji: string;
}

export const VPN_APPS: VpnAppLink[] = [
  {
    id: 'happ',
    name: 'Happ',
    note: 'iOS, Android, macOS, Windows',
    platform: 'all',
    storeUrl: 'https://apps.apple.com/app/happ-client/id1437656443',
    emoji: '🟢',
  },
  {
    id: 'streisand',
    name: 'Streisand',
    note: 'iOS и Android',
    platform: 'all',
    storeUrl: 'https://apps.apple.com/ru/app/streisand/id6458534994',
    emoji: '🪄',
  },
  {
    id: 'v2rayng',
    name: 'v2rayNG',
    note: 'Только Android',
    platform: 'android',
    storeUrl: 'https://play.google.com/store/apps/details?id=com.2ray.ang',
    emoji: '🤖',
  },
  {
    id: 'v2box',
    name: 'V2Box',
    note: 'Только iOS / iPadOS',
    platform: 'ios',
    storeUrl: 'https://apps.apple.com/app/v2box/id6447111083',
    emoji: '🍎',
  },
  {
    id: 'shadowrocket',
    name: 'Shadowrocket',
    note: 'Только iOS, платное',
    platform: 'ios',
    storeUrl: 'https://apps.apple.com/app/shadowrocket/id932747118',
    emoji: '🚀',
  },
  {
    id: 'nekoray',
    name: 'NekoRay',
    note: 'Windows и macOS',
    platform: 'desktop',
    storeUrl: 'https://github.com/MatsuriDayo/nekoray/releases',
    emoji: '🐈',
  },
  {
    id: 'v2rayn',
    name: 'v2rayN',
    note: 'Только Windows',
    platform: 'desktop',
    storeUrl: 'https://github.com/2dust/v2rayN/releases',
    emoji: '🪟',
  },
];

/* ── Шаги инструкции (п. 11) ───────────────────────────────────────────── */

export interface InstructionStep {
  id: string;
  title: string;
  text: string;
}

export const INSTRUCTION_STEPS: InstructionStep[] = [
  {
    id: 'install',
    title: 'Установите поддерживаемое VPN-приложение',
    text: 'Выберите приложение из списка ниже и установите его на устройство. Для iOS — App Store или TestFlight, для Android — Google Play.',
  },
  {
    id: 'copy',
    title: 'Скопируйте свою конфигурацию',
    text: 'Откройте экран «Ваш VPN», нажмите «Копировать конфигурацию» и убедитесь, что рядом появилась отметка «Скопировано».',
  },
  {
    id: 'import',
    title: 'Добавьте конфигурацию в приложение',
    text: 'В приложении выберите «Добавить сервер» / «Import from clipboard» и подтвердите добавление — конфигурация появится в списке.',
  },
  {
    id: 'connect',
    title: 'Активируйте подключение',
    text: 'Отметьте добавленный сервер и нажмите «Подключиться». Когда индикатор станет зелёным, интернет пойдёт через VPN.',
  },
];

/* ── FAQ ────────────────────────────────────────────────────────────────── */

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ: FaqItem[] = [
  {
    q: 'Как проверить, что VPN работает?',
    a: 'Откройте любой сайт и убедитесь, что в приложении горит зелёный индикатор. В настройках приложения должен быть указан IP-адрес сервера.',
  },
  {
    q: 'Сколько устройств можно подключить?',
    a: 'Количество устройств зависит от вашего тарифа и отображается на экране «Подписка». Конфигурацию можно добавить на любое разрешённое устройство.',
  },
  {
    q: 'Что делать, если не подключается?',
    a: 'Попробуйте сменить сервер в приложении, либо перезапустите приложение. Если не помогло — напишите в поддержку, приложим инструкцию по диагностике.',
  },
  {
    q: 'Можно ли вернуть деньги?',
    a: 'Условия возврата зависят от срока использования. Напишите в поддержку с номером Telegram — мы разберём запрос индивидуально.',
  },
  {
    q: 'Как отменить автопродление?',
    a: 'Если автопродление включено, его можно отключить в боте командой /unsubscribe. Подписка останется активной до конца оплаченного периода.',
  },
];

/* ── Тексты ─────────────────────────────────────────────────────────────── */

export const COPY = {
  errors: {
    load: 'Не удалось загрузить данные.',
    retry: 'Повторить',
    network: 'Нет связи с сервером. Проверьте интернет.',
    unauthorized: 'Сессия истекла. Перезапустите приложение.',
    forbidden: 'Недостаточно прав для этого действия.',
    notFound: 'Данные не найдены.',
    paymentFailed: 'Платёж не завершён. Попробуйте ещё раз.',
    paymentExpired: 'Время оплаты истекло. Создайте новый заказ.',
    vpnProvisionFailed:
      'Оплата прошла, но VPN пока не активировался. Мы уже создаём его — обновите экран через минуту.',
    generic: 'Что-то пошло не так. Попробуйте ещё раз.',
  },
  withdraw: {
    minAmount: (value: string) => `Минимальная сумма вывода — ${value}.`,
    amountAboveBalance: 'Сумма больше доступного баланса.',
    invalidAmount: 'Введите корректную сумму.',
    invalidRequisites: 'Укажите реквизиты (минимум 5 символов).',
  },
} as const;