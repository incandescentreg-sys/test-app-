/**
 * Форматирование: даты, деньги, числа. Только презентация — никакой
 * бизнес-логики и никаких округлений денег в сторону выгоды пользователю.
 */

import type { Subscription, SubscriptionStatus } from '@/types';

const LOCALE = 'ru-RU';

const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const MONTHS_NOM = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

/** «30 октября 2026» */
export function formatDateLong(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
}

/** «30 окт. 2026» — для тесных мест */
export function formatDateShort(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '—';
  const m = MONTHS_NOM[d.getMonth()] ?? '';
  return `${d.getDate()} ${m.slice(0, 3).toLowerCase()}. ${d.getFullYear()}`;
}

/** «30.12.2026» — для плотных карточек */
export function formatDateCompact(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Время в формате 18:00 — для подтверждения копирования */
export function formatTime(date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '—';
  return `${formatDateCompact(iso)}, ${formatTime(d)}`;
}

/** 29900 → «299 ₽». По умолчанию суммы приходят в копейках. */
export function formatMoney(
  valueInMinor: number | null | undefined,
  currency = 'RUB',
  opts: { minorUnits?: boolean } = {},
): string {
  if (valueInMinor === null || valueInMinor === undefined || Number.isNaN(valueInMinor)) {
    return '—';
  }
  const major = opts.minorUnits === false ? valueInMinor : valueInMinor / 100;
  const rounded = Math.round(major * 100) / 100;
  const symbol =
    currency === 'RUB' || currency === '₽' ? '₽' : currency === 'USD' ? '$' : currency;
  return `${groupDigits(rounded)} ${symbol}`.trim();
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(LOCALE).format(value);
}

export function formatGigabytes(gb: number | null | undefined): string {
  if (gb === null || gb === undefined || Number.isNaN(gb)) return '—';
  if (gb >= 1000) return `${Math.round(gb)} ГБ`;
  const rounded = Math.round(gb * 10) / 10;
  return `${String(rounded).replace('.', ',')} ГБ`;
}

function groupDigits(n: number): string {
  const hasFraction = n % 1 !== 0;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(n);
}

/** Склонение: 1 день / 2 дня / 5 дней */
export function pluralize(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

export function formatDays(count: number | null | undefined): string {
  if (count === null || count === undefined || Number.isNaN(count)) return '—';
  if (count <= 0) return 'Истекла';
  return `${count} ${pluralize(count, 'день', 'дня', 'дней')}`;
}

export function formatDuration(days: number | null | undefined): string {
  if (!days) return '—';
  if (days % 365 === 0 && days >= 365) {
    const y = days / 365;
    return `${y} ${pluralize(y, 'год', 'года', 'лет')}`;
  }
  if (days % 30 === 0 && days >= 30) {
    const m = days / 30;
    return `${m} ${pluralize(m, 'месяц', 'месяца', 'месяцев')}`;
  }
  return `${days} ${pluralize(days, 'день', 'дня', 'дней')}`;
}

/* ── Подписка ──────────────────────────────────────────────────────────── */

export function isSubscriptionActive(sub: Subscription | null | undefined): boolean {
  if (!sub) return false;
  return sub.status === 'active' || sub.status === 'expiring';
}

export function hasSubscription(sub: Subscription | null | undefined): boolean {
  if (!sub) return false;
  return sub.status !== 'none' && sub.status !== 'pending';
}

export function subscriptionBadge(status: SubscriptionStatus): {
  label: string;
  tone: 'active' | 'warn' | 'off';
} {
  switch (status) {
    case 'active':
      return { label: 'Активна', tone: 'active' };
    case 'expiring':
      return { label: 'Скоро истекает', tone: 'warn' };
    case 'expired':
      return { label: 'Истекла', tone: 'off' };
    case 'pending':
      return { label: 'Обрабатывается', tone: 'warn' };
    case 'frozen':
      return { label: 'Приостановлена', tone: 'off' };
    case 'none':
    default:
      return { label: 'Нет подписки', tone: 'off' };
  }
}

/**
 * Прогресс срока подписки в процентах.
 * Считается только для отображения; решение «активна ли подписка»
 * принимает backend по полю status.
 */
export function subscriptionProgress(sub: Subscription | null | undefined): number {
  if (!sub?.startAt || !sub?.expiresAt) return 0;
  const start = parse(sub.startAt)?.getTime() ?? 0;
  const end = parse(sub.expiresAt)?.getTime() ?? 0;
  if (!start || !end || end <= start) return 0;
  const now = Date.now();
  const pct = ((now - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** Значение для полосы прогресса: сколько % срока ещё осталось. */
export function subscriptionRemainingPct(sub: Subscription | null | undefined): number {
  return 100 - subscriptionProgress(sub);
}

/* ── Разное ────────────────────────────────────────────────────────────── */

export function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Склонение для произвольных слов: pluralize(count, ['день','дня','дней']) */
export function plural(count: number, forms: [string, string, string]): string {
  return pluralize(count, forms[0], forms[1], forms[2]);
}

/** Текст для aria-label у иконок. */
export function srLabel(text: string): string {
  return text;
}