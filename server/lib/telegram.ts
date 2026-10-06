/**
 * Проверка подписи Telegram initData.
 *
 * Это ЕДИНСТВЕННЫЙ источник идентичности пользователя. Ни один маршрут
 * не принимает userId из тела запроса или query-параметров: клиент подделывает
 * всё, кроме HMAC-подписи, которую Telegram вычислил своим бот-токеном.
 *
 * Алгоритм (официальный, docs.telegram.org/bots/webapps):
 *   secret = HMAC_SHA256(key = "WebAppData", data = BOT_TOKEN)
 *   hash   = HMAC_SHA256(key = secret,        data = data_check_string)
 *
 * Здесь используется node:crypto — на edge-рантайме его нет, поэтому
 * функции живут в обычных Node-функциях Vercel.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { BOT_TOKEN, BOT_TOKEN_FALLBACKS, INIT_DATA_MAX_AGE_SEC } from './env.js';
import { log, unauthorized } from './http.js';

/** Заголовок, в котором Mini App передаёт подписанные данные. */
export const AUTH_HEADER = 'X-Telegram-Init-Data';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export interface TelegramAuth {
  user: TelegramUser;
  /** Подписанный start_param: единственный источник ref-кода. */
  startParam: string | null;
  /** Unix-время подписи. */
  authDate: number;
  /** Вся строка initData — нужна, чтобы не распарсить дважды. */
  raw: string;
}

/** Сравнение строк за постоянное время: защита от timing-атак. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Проверка initData.
 *
 * Бросает `unauthorized` при любом подозрении: битая подпись, протухшая
 * сессия, отсутствие user. Никаких «мягких» режимов.
 */
export function validateInitData(initData: string): TelegramAuth {
  if (!initData || initData.length > 4096) throw unauthorized();

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw unauthorized();
  params.delete('hash');
  // Ключ подписи не должен участвовать в data_check_string.
  params.delete('signature');

  // Сортировка пар по ключу — требование Telegram к data_check_string.
  const pairs = [...params.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join('\n');

  // Подпись проверяется по каждому известному токену. При ротации токена
  // в Telegram старый ещё какое-то время приходит от уже открытых
  // приложений: без запасного варианта все они вылетели бы в
  // «сессия истекла», хотя новый токен уже выдан.
  const tokens = [BOT_TOKEN(), ...BOT_TOKEN_FALLBACKS()];
  let matched = false;

  for (const token of tokens) {
    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');
    if (safeEqual(expected, hash)) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    // Логируем только форму запроса: ни подпись, ни токен в лог не попадают.
    // Префикс query_id полезен при разборе: по нему видно, каким ботом
    // подписаны данные, — сам query_id секретом не является.
    log('telegram', 'подпись не совпала ни с одним токеном', {
      fields: pairs.map(([key]) => key).sort(),
      queryIdPrefix: (params.get('query_id') ?? '').slice(0, 12),
      expectedBotIds: tokens
        .map((token) => token.split(':')[0])
        .filter(Boolean)
        .join(','),
      knownTokens: tokens.length,
    });
    throw unauthorized();
  }

  const authDate = Number(params.get('auth_date') ?? '0');
  if (!Number.isFinite(authDate) || authDate <= 0) throw unauthorized();

  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > INIT_DATA_MAX_AGE_SEC()) throw unauthorized();
  // Допуск на расхождение часов: initData не может быть из будущего.
  if (ageSec < -300) throw unauthorized();

  let user: TelegramUser;
  try {
    user = JSON.parse(params.get('user') ?? '') as TelegramUser;
  } catch {
    throw unauthorized();
  }
  if (!user || typeof user.id !== 'number' || !Number.isFinite(user.id)) throw unauthorized();

  return {
    user,
    startParam: params.get('start_param'),
    authDate,
    raw: initData,
  };
}

/**
 * Достаёт и проверяет initData из запроса.
 * Единственная точка входа для всех защищённых маршрутов.
 */
export function requireAuth(req: VercelRequest): TelegramAuth {
  const header = req.headers[AUTH_HEADER.toLowerCase()];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || typeof raw !== 'string') {
    throw unauthorized('Откройте приложение через Telegram.');
  }
  return validateInitData(raw);
}

/**
 * Разбирает реферальный код из ПОДПИСАННОГО start_param.
 *
 * Формат: `ref_<telegramId>`. Значение приходит уже проверенным HMAC,
 * поэтому подделать ref-id нельзя (в отличие от initDataUnsafe на клиенте).
 */
export function parseReferralId(startParam: string | null): number | null {
  if (!startParam) return null;
  const match = /^ref_(\d{1,20})$/.exec(startParam.trim());
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}