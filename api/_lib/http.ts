/**
 * Общие помощники HTTP-слоя: ответы, ошибки, разбор тела, CORS.
 *
 * Ключевое правило: наружу уходит ТОЛЬКО `{ code, message }`.
 * Технические детали (стектрейс, SQL, токены) — в лог, никогда в тело ответа.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ALLOWED_ORIGINS } from './env';

/* ── Ошибки ──────────────────────────────────────────────────────────────── */

/**
 * Ошибка, безопасная для показа пользователю.
 *
 * `code` фронтенд использует для выбора текста: если кода нет в белом
 * списке — показывается безопасная заглушка, а `message` игнорируется.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const unauthorized = (message = 'Сессия истекла. Перезапустите приложение.') =>
  new ApiError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Недостаточно прав для этого действия.') =>
  new ApiError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Данные не найдены.') => new ApiError(404, 'NOT_FOUND', message);

export const validation = (message = 'Проверьте заполненные поля.') =>
  new ApiError(400, 'VALIDATION_ERROR', message);

export const rateLimited = (message = 'Слишком много запросов. Подождите немного.') =>
  new ApiError(429, 'RATE_LIMITED', message);

export const unavailable = (message = 'Сервис временно недоступен. Попробуйте ещё раз.') =>
  new ApiError(503, 'SERVICE_UNAVAILABLE', message);

/* ── Логирование ─────────────────────────────────────────────────────────── */

/**
 * Лог с маскированием. Никогда не пишем в лог:
 * initData, vless://, sub_url, токены панели.
 */
export function log(scope: string, message: string, extra?: Record<string, unknown>): void {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (/init_?data|token|secret|password|link|url|uuid|key/i.test(key)) continue;
    safe[key] = value;
  }
  // console.info попадает в логи Vercel и ничего не ломает в рантайме.
  console.info(`[${scope}] ${message}`, Object.keys(safe).length > 0 ? safe : '');
}

export function logError(scope: string, message: string, error: unknown): void {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[${scope}] ${message}: ${detail}`);
}

/* ── Ответы ──────────────────────────────────────────────────────────────── */

/**
 * CORS включается только если домен явно разрешён в ALLOWED_ORIGINS.
 * По умолчанию список пуст: Mini App и backend живут на одном домене,
 * поэтому добавлять заголовки незачем.
 */
export function applyCors(req: VercelRequest, res: VercelResponse): void {
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = ALLOWED_ORIGINS();
  if (!allowed.includes(origin) && !allowed.includes('*')) return;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
}

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  // Приватный ответ: не отдаём его прокси и браузерному кэшу.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(body);
}

export function sendOk(res: VercelResponse, body: unknown, status = 200): void {
  sendJson(res, status, body);
}

/**
 * Готовит запрос: OPTIONS закрываем сразу, остальным проставляем CORS.
 * Возвращает true, если ответ уже отправлен — обработчик обязан выйти.
 */
export function prepare(req: VercelRequest, res: VercelResponse): boolean {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Единая точка обработки ошибок.
 *
 * Известные ApiError отдаются как есть. Всё остальное — 500 с нейтральным
 * текстом, детали только в лог.
 */
export function sendError(res: VercelResponse, error: unknown, scope = 'api'): void {
  if (error instanceof ApiError) {
    sendJson(res, error.status, { code: error.code, message: error.message });
    return;
  }

  logError(scope, 'unhandled error', error);
  sendJson(res, 500, {
    code: 'INTERNAL_ERROR',
    message: 'Что-то пошло не так. Попробуйте ещё раз.',
  });
}

/* ── Тело запроса ────────────────────────────────────────────────────────── */

/** Безопасный разбор JSON-тела. Неизвестный тип → пустой объект. */
export async function readJson<T = Record<string, unknown>>(req: VercelRequest): Promise<T> {
  const body = req.body;
  if (body && typeof body === 'object') return body as T;
  if (typeof body === 'string' && body.length > 0) {
    try {
      const parsed = JSON.parse(body);
      return (typeof parsed === 'object' && parsed !== null ? parsed : {}) as T;
    } catch {
      throw validation('Некорректный формат запроса.');
    }
  }
  return {} as T;
}

/** Метод запроса, приведённый к верхнему регистру. */
export function method(req: VercelRequest): string {
  return String(req.method ?? 'GET').toUpperCase();
}