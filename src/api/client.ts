/**
 * HTTP-клиент к backend.
 *
 * КЛЮЧЕВЫЕ ИНВАРИАНТЫ (ТЗ п. 16, 18, 26):
 *
 *  1. Идентификация пользователя — ТОЛЬКО через подписанный Telegram initData,
 *     который передаётся в заголовке `X-Telegram-Init-Data`.
 *     Никаких `?userId=`, `?id=`, никакого userId в теле запроса.
 *     Backend извлекает user.id из HMAC-подписи и сам решает, кто это.
 *
 *  2. Клиент никогда не вычисляет цену, баланс, статус оплаты или остаток
 *     подписки. Он получает их от сервера и отображает.
 *
 *  3. Никаких секретов в бандле. Здесь нет ни одного H1VLESS-токена.
 *
 *  4. Пользователю не показываются stack trace, JSON-ошибки и технические
 *     строки: все ошибки нормализуются в короткий русский текст (п. 20).
 */

import { APP_CONFIG, COPY } from '@/config/app';
import { logger } from '@/lib/logger';
import { getInitData, isInsideTelegram } from '@/lib/telegram';

const SCOPE = 'api';

/** Заголовок, в котором едет подписанная initData. */
export const AUTH_HEADER = 'X-Telegram-Init-Data';

/* ── Ошибка ────────────────────────────────────────────────────────────── */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  /** Технические детали — только для логов, никогда не показываем пользователю. */
  readonly details: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Можно ли осмысленно предложить «Повторить». */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }

  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function toApiError(e: unknown): ApiError {
  if (isApiError(e)) return e;
  if (e instanceof DOMException && e.name === 'AbortError') {
    return new ApiError(0, COPY.errors.network, 'TIMEOUT');
  }
  if (e instanceof TypeError) {
    return new ApiError(0, COPY.errors.network, 'NETWORK');
  }
  return new ApiError(0, COPY.errors.generic, 'UNKNOWN');
}

/**
 * Белый список кодов, для которых backend может отдать свой
 * пользовательский текст. Всё остальное заменяется на безопасный дефолт.
 * Так мы физически не можем вывести пользователю SQL-ошибку или стектрейс.
 */
const SAFE_BACKEND_MESSAGES: ReadonlySet<string> = new Set([
  'BALANCE_TOO_LOW',
  'MIN_WITHDRAWAL_NOT_REACHED',
  'ALREADY_HAS_ACTIVE_SUBSCRIPTION',
  'SUBSCRIPTION_NOT_FOUND',
  'VPN_NOT_READY',
  'PLAN_UNAVAILABLE',
  'PAYMENT_ALREADY_PAID',
  'ORDER_EXPIRED',
  'WITHDRAWAL_PENDING_EXISTS',
  'RATE_LIMITED',
  'INVALID_REQUISITES',
]);

const ERROR_CODE_MESSAGES: Readonly<Record<string, string>> = {
  UNAUTHORIZED: COPY.errors.unauthorized,
  FORBIDDEN: COPY.errors.forbidden,
  NOT_FOUND: COPY.errors.notFound,
  BALANCE_TOO_LOW: 'Недостаточно средств на балансе.',
  MIN_WITHDRAWAL_NOT_REACHED: 'Минимальная сумма вывода ещё не набрана.',
  PLAN_UNAVAILABLE: 'Этот тариф сейчас недоступен. Выберите другой.',
  PAYMENT_ALREADY_PAID: 'Этот заказ уже оплачен.',
  ORDER_EXPIRED: COPY.errors.paymentExpired,
  VPN_NOT_READY: COPY.errors.vpnProvisionFailed,
  RATE_LIMITED: 'Слишком много запросов. Подождите немного.',
  VALIDATION_ERROR: 'Проверьте заполненные поля.',
  INVALID_REQUISITES: 'Укажите корректные реквизиты.',
};

/**
 * Единственная точка превращения ответа сервера в текст для пользователя.
 * Никаких сырых сообщений из backend наружу.
 */
function userMessage(status: number, code: string | undefined, raw: unknown): string {
  if (code && code in ERROR_CODE_MESSAGES) return ERROR_CODE_MESSAGES[code] as string;

  if (
    code &&
    SAFE_BACKEND_MESSAGES.has(code) &&
    typeof raw === 'string' &&
    raw.length > 0 &&
    raw.length < 240
  ) {
    return raw;
  }

  if (status === 0) return COPY.errors.network;
  if (status === 401) return COPY.errors.unauthorized;
  if (status === 403) return COPY.errors.forbidden;
  if (status === 404) return COPY.errors.notFound;
  if (status === 429) return 'Слишком много запросов. Подождите немного.';
  if (status >= 500) return 'Сервис временно недоступен. Попробуйте ещё раз.';
  return COPY.errors.generic;
}

/* ── Низкоуровневый request ────────────────────────────────────────────── */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
  /** Пропустить авторизацию (только для /health). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

interface BackendErrorBody {
  message?: unknown;
  error?: unknown;
  code?: unknown;
  details?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Собирает заголовки. Заголовок с initData добавляется ВСЕГДА (кроме
 * анонимных запросов), даже если он пуст — так backend может отличить
 * «браузер» от «Telegram» и ответить корректной ошибкой вместо падения.
 */
function buildHeaders(body: unknown, anonymous: boolean): Headers {
  const headers = new Headers();
  headers.set('Accept', 'application/json');

  if (!anonymous) {
    const initData = getInitData();
    if (initData) {
      headers.set(AUTH_HEADER, initData);
    } else if (!isInsideTelegram()) {
      // Открыто в обычном браузере. Заголовок не отправляем — backend
      // корректно ответит 401, мы покажем понятное сообщение.
      logger.debug(SCOPE, 'initData отсутствует: приложение открыто вне Telegram');
    }
  }

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    timeoutMs = APP_CONFIG.timeouts.default,
    anonymous = false,
    signal,
  } = options;

  const url = `${APP_CONFIG.apiBaseUrl}${path}`;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: buildHeaders(body, anonymous),
      // Session-cookie вариант: backend может использовать HttpOnly-сессию
      // вместо (или вместе с) initData.
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      mode: 'cors',
      cache: 'no-store',
    });
  } catch (error) {
    logger.warn(SCOPE, { path, method, error });
    throw toApiError(error);
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }

  // ── Разбор ответа ──────────────────────────────────────────────────────
  const rawText = await response.text().catch(() => '');
  let payload: unknown = null;
  let parseFailed = false;

  if (rawText.length > 0) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      // Backend-ошибка в виде HTML/plain text (например, 502 от Vercel).
      parseFailed = true;
    }
  }

  if (!response.ok) {
    const errBody: BackendErrorBody = isRecord(payload) ? payload : {};
    const code =
      typeof errBody.code === 'string'
        ? errBody.code
        : typeof errBody.error === 'string'
          ? errBody.error
          : undefined;
    const rawMessage = typeof errBody.message === 'string' ? errBody.message : undefined;

    logger.warn(SCOPE, { path, method, status: response.status, code });

    throw new ApiError(
      response.status,
      userMessage(response.status, code, rawMessage),
      code,
      errBody.details,
    );
  }

  if (parseFailed && rawText.length > 0) {
    logger.error(SCOPE, { path, message: 'Невалидный JSON в успешном ответе' });
    throw new ApiError(response.status, COPY.errors.generic, 'BAD_RESPONSE');
  }

  // Пустой успешный ответ (204) → null
  if (payload === null) return null as T;

  // Разные backend'ы оборачивают результат в { data: ... } — снимаем обёртку.
  if (isRecord(payload) && 'data' in payload && Object.keys(payload).length <= 3) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

/* ── Публичные хелперы ─────────────────────────────────────────────────── */

export const http = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'GET' }),

  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),

  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};

/**
 * Проверка «приложение запущено в Telegram».
 * Вызывается до первого запроса, чтобы показать честный экран, а не
 * кашу из 401 (п. 20).
 */
export function assertTelegramContext(): void {
  if (isInsideTelegram()) return;
  throw new ApiError(
    401,
    'Откройте приложение через Telegram — вне него вход не работает.',
    'NO_TELEGRAM_CONTEXT',
  );
}