/**
 * Обёртка над Telegram WebApp SDK.
 *
 * Один и только один модуль в приложении касается window.Telegram.
 * Все вызовы защищены feature-detection'ом, поэтому приложение не падает
 * в обычном браузере (dev-режим) и корректно ведёт себя на iOS, Android
 * и Telegram Desktop, где часть методов может отсутствовать.
 */

import { APP_CONFIG } from '@/config/app';
import { logger } from './logger';

interface TgThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
}

interface TgHaptic {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
}

interface TgBackButton {
  isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TgMainButton {
  isVisible: boolean;
  text: string;
  show(): void;
  hide(): void;
  setText(t: string): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
  enable(): void;
  disable(): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      photo_url?: string;
    };
    auth_date?: number;
    start_param?: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: TgThemeParams;
  viewportHeight: number;
  viewportStableHeight: number;
  isExpanded: boolean;
  BackButton: TgBackButton;
  MainButton: TgMainButton;
  HapticFeedback?: TgHaptic;
  isVersionAtLeast(v: string): boolean;
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  disableVerticalSwipes?(): void;
  requestFullscreen?(): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink?(url: string): void;
  showPopup?(params: unknown, cb?: (id: string) => void): void;
  share?(url: string, text?: string, cb?: () => void): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  switchInlineQuery?(query: string, chatTypes?: string[]): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

const SCOPE = 'telegram';

export function getWebApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

/** Работает ли приложение внутри Telegram (а не в обычном браузере). */
export function isInsideTelegram(): boolean {
  const wa = getWebApp();
  return Boolean(wa && wa.initData);
}

/** initData — единственный «токен» авторизации. Показывается в логах только замаскированным. */
export function getInitData(): string {
  return getWebApp()?.initData ?? '';
}

/**
 * Данные из initDataUnsafe. ИСПОЛЬЗУЮТСЯ ТОЛЬКО для мгновенного показа
 * имени/аватара до ответа backend. Никаких решений по ним не принимается —
 * авторизация всегда за backend'ом (п. 16).
 */
export function getInitDataUnsafeUser() {
  return getWebApp()?.initDataUnsafe?.user ?? null;
}

export function getStartParam(): string | null {
  return getWebApp()?.initDataUnsafe?.start_param ?? null;
}

export function platform(): string {
  return getWebApp()?.platform ?? 'unknown';
}

export function isIOS(): boolean {
  return platform() === 'ios';
}

export function isAndroid(): boolean {
  return platform() === 'android';
}

/** Доступно ли нативное окно «Поделиться» (Telegram Bot API 8.0+ / клиент 7.10+). */
export function supportsNativeShare(): boolean {
  const wa = getWebApp();
  return Boolean(wa && typeof wa.share === 'function' && wa.isVersionAtLeast('7.10'));
}

/* ── Инициализация ──────────────────────────────────────────────────────── */

let initialized = false;

export function initTelegram(): void {
  const wa = getWebApp();
  if (!wa) {
    logger.warn(SCOPE, 'WebApp SDK недоступен — вероятно, открыто вне Telegram');
    return;
  }
  if (initialized) return;
  initialized = true;

  try {
    wa.ready();
    wa.expand();

    // Растягиваем на весь экран, если клиент умеет.
    wa.requestFullscreen?.();

    // Убираем «резиновую» прокрутку тапами по фону — приложение должно
    // ощущаться нативным, а не веб-страницей.
    wa.disableVerticalSwipes?.();

    // Зелёная айдентика важнее темы клиента (п. 24).
    wa.setBackgroundColor?.('#F7FBF9');
    wa.setHeaderColor?.('#F7FBF9');

    logger.debug(SCOPE, { version: wa.version, platform: wa.platform });
  } catch (error) {
    logger.error(SCOPE, error);
  }
}

/* ── Инициализация, когда скрипт SDK загрузится позже ──────────────────── */

export function whenTelegramReady(timeoutMs = 4000): Promise<void> {
  if (getWebApp()) return Promise.resolve();
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (getWebApp() || Date.now() - started > timeoutMs) {
        window.clearInterval(timer);
        resolve();
      }
    }, 60);
  });
}

/* ── Safe area / viewport (п. 23) ─────────────────────────────────────── */

const root = () => (typeof document === 'undefined' ? null : document.documentElement);

function setVar(name: string, value: string): void {
  root()?.style.setProperty(name, value);
}

export function syncViewportVars(): void {
  const wa = getWebApp();
  if (!wa) return;
  try {
    // Telegram выставляет --tg-viewport-height / --tg-viewport-stable-height.
    // Подстрахуемся нашим значением, если их нет (Telegram Desktop).
    const stable = wa.viewportStableHeight || wa.viewportHeight;
    if (stable) setVar('--tg-viewport-stable-height', `${stable}px`);
    if (wa.viewportHeight) setVar('--tg-viewport-height', `${wa.viewportHeight}px`);

    // Safe area. Приложение разворачивается на весь экран (expand), поэтому
    // контент заходит под служебную шапку Telegram. Отступ, который она
    // требует, Telegram сообщает CSS-переменной
    // --tg-content-safe-area-inset-top: игнорировать её нельзя, иначе наша
    // шапка наезжает на кнопку закрытия.
    const meta = readViewportInsets();
    setVar('--safe-top', `${Math.max(meta.top, readTelegramInset('--tg-content-safe-area-inset-top'))}px`);
    setVar(
      '--safe-bottom',
      `${Math.max(meta.bottom, readTelegramInset('--tg-content-safe-area-inset-bottom'))}px`,
    );
  } catch (error) {
    logger.error(SCOPE, error);
  }
}

/**
 * Значение CSS-переменной Telegram в пикселях.
 *
 * Переменная может отсутствовать (Telegram Desktop, старые клиенты) —
 * тогда возвращается 0, и отступ берётся из запасного источника.
 */
function readTelegramInset(name: string): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function readViewportInsets(): { top: number; bottom: number } {
  const metaEl = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!metaEl) return { top: 0, bottom: 0 };
  const top = /viewport-fit=cover/.test(metaEl.content || '');
  return { top: top ? 12 : 0, bottom: top ? 12 : 0 };
}

/* ── Тактильная отдача (п. 22) ─────────────────────────────────────────── */

export const haptic = {
  light(): void {
    try {
      getWebApp()?.HapticFeedback?.impactOccurred('light');
    } catch {
      /* не критично */
    }
  },
  medium(): void {
    try {
      getWebApp()?.HapticFeedback?.impactOccurred('medium');
    } catch {
      /* не критично */
    }
  },
  success(): void {
    try {
      getWebApp()?.HapticFeedback?.notificationOccurred('success');
    } catch {
      /* не критично */
    }
  },
  error(): void {
    try {
      getWebApp()?.HapticFeedback?.notificationOccurred('error');
    } catch {
      /* не критично */
    }
  },
  warning(): void {
    try {
      getWebApp()?.HapticFeedback?.notificationOccurred('warning');
    } catch {
      /* не критично */
    }
  },
  select(): void {
    try {
      getWebApp()?.HapticFeedback?.selectionChanged();
    } catch {
      /* не критично */
    }
  },
};

/* ── Навигация / ссылки ────────────────────────────────────────────────── */

export function openTelegramLink(url: string): void {
  const wa = getWebApp();
  if (wa?.openTelegramLink) {
    wa.openTelegramLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openLink(url: string): void {
  const wa = getWebApp();
  if (wa?.openLink) {
    wa.openLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function closeApp(): void {
  try {
    getWebApp()?.close();
  } catch {
    /* не критично */
  }
}

/**
 * Открывает URL оплаты (п. 32).
 *  • t.me-ссылка → openTelegramLink (остаётся внутри Telegram);
 *  • внешний https → openLink (откроется в WebView-браузере Telegram).
 */
export function openPaymentLink(url: string): void {
  if (url.startsWith('https://t.me') || url.startsWith('tg://')) {
    openTelegramLink(url);
    return;
  }
  openLink(url);
}

/* ── Шеринг (п. 13) ────────────────────────────────────────────────────── */

export type ShareResult = 'native' | 'fallback' | 'failed';

export function shareUrl(url: string, text?: string): ShareResult {
  const wa = getWebApp();
  try {
    if (wa && typeof wa.share === 'function' && wa.isVersionAtLeast('7.10')) {
      wa.share(url, text ?? '');
      return 'native';
    }
    // Фолбэк: старый t.me/share/url работает на всех клиентах.
    const shareUrl_ = new URL('https://t.me/share/url');
    shareUrl_.searchParams.set('url', url);
    if (text) shareUrl_.searchParams.set('text', text);
    openTelegramLink(shareUrl_.toString());
    return 'fallback';
  } catch (error) {
    logger.error(SCOPE, error);
    return 'failed';
  }
}

/* ── BackButton (нативная стрелка Telegram) ─────────────────────────────── */

export function showBackButton(onClick: () => void): void {
  const wa = getWebApp();
  if (!wa) return;
  try {
    wa.BackButton.onClick(onClick);
    wa.BackButton.show();
  } catch (error) {
    logger.error(SCOPE, error);
  }
}

export function hideBackButton(): void {
  const wa = getWebApp();
  if (!wa) return;
  try {
    wa.BackButton.offClick(() => undefined);
    wa.BackButton.hide();
  } catch {
    /* не критично */
  }
}

/* ── Подтверждение закрытия на чувствительных экранах ───────────────────── */

let closingGuard: (() => void) | null = null;

export function setClosingGuard(enabled: boolean): void {
  const wa = getWebApp();
  if (!wa) return;
  try {
    if (enabled) {
      if (!closingGuard) {
        closingGuard = () => undefined;
        wa.enableClosingConfirmation();
      }
    } else if (closingGuard) {
      closingGuard = null;
      wa.disableClosingConfirmation();
    }
  } catch {
    /* не критично */
  }
}

/* ── Тема ──────────────────────────────────────────────────────────────── */

/**
 * Telegram отдаёт themeParams. Зелёную айдентику не переопределяем,
 * но подсказываем подсветку через CSS-переменные, которые наш CSS уже читает.
 */
export function readThemeParams(): TgThemeParams | null {
  return getWebApp()?.themeParams ?? null;
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** Диагностика для README / отладки. Не содержит секретов. */
export function describeEnvironment() {
  const wa = getWebApp();
  return {
    insideTelegram: Boolean(wa),
    version: wa?.version ?? null,
    platform: wa?.platform ?? null,
    colorScheme: wa?.colorScheme ?? null,
    hasNativeShare: supportsNativeShare(),
    botUsername: APP_CONFIG.botUsername || null,
  };
}