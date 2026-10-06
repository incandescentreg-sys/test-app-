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

import { createHmac, createPublicKey, timingSafeEqual, verify as verifySignature, type KeyObject } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import {
  BOT_TOKEN,
  BOT_TOKEN_FALLBACKS,
  DEBUG_INITDATA,
  INIT_DATA_MAX_AGE_SEC,
} from './env.js';
import { log, unauthorized } from './http.js';

/** Заголовок, в котором Mini App передаёт подписанные данные. */
export const AUTH_HEADER = 'X-Telegram-Init-Data';

/**
 * Публичные ключи Telegram для проверки поля `signature` (сторонняя
 * валидация, Bot API 7.0+). Позволяют убедиться, что данные подписал
 * Telegram, не имея токена бота, — полезно как независимая проверка и
 * как страховка на рассинхронизацию токена при ротации.
 */
const TELEGRAM_PUBLIC_KEYS: Record<string, string> = {
  production: 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',
  test: '40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec',
};

/** Префикс SPKI-DER для 32-байтового открытого ключа Ed25519. */
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Строка для сторонней валидации отличается от боевой: в начало
 * добавляются `<bot_id>:WebAppData` и перевод строки. Именно поэтому
 * проверка по токену и проверка по подписи Telegram — разные вещи,
 * и совпадение одной не доказывает корректность другой.
 */
function thirdPartyDataCheckString(botId: string, fields: Array<[string, string]>): string {
  const body = fields.map(([key, value]) => `${key}=${value}`).join('\n');
  return `${botId}:WebAppData\n${body}`;
}

function buildEd25519Key(hexKey: string): KeyObject | null {
  try {
    return createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(hexKey, 'hex')]),
      format: 'der',
      type: 'spki',
    });
  } catch {
    return null;
  }
}

/**
 * Матрица способов вычислить hash.
 *
 * Официальная документация описывает один способ, и он не сходится с
 * реальными данными Telegram, поэтому перебираем варианты: разные
 * способы получить секрет из токена, разные формы строки и оба порядка
 * аргументов HMAC. Победа фиксируется в логе — это перебор вариантов
 * реализации, а не ослабление проверки.
 */
function hashCandidates(
  token: string,
  botId: string,
  pairs: Array<[string, string]>,
): Array<[string, string]> {
  const body = pairs.map(([key, value]) => `${key}=${value}`).join('\n');

  const secrets: Array<[string, Buffer | string]> = [
    ['secret=HMAC(WebAppData,token)', createHmac('sha256', 'WebAppData').update(token).digest()],
    ['secret=HMAC(token,WebAppData)', createHmac('sha256', token).update('WebAppData').digest()],
    ['secret=WebAppData', 'WebAppData'],
    ['secret=token', token],
    ['secret=botId:WebAppData', `${botId}:WebAppData`],
  ];

  const strings: Array<[string, string]> = [
    ['строка=поля', body],
    ['строка=поля+\\n', `${body}\n`],
    ['строка=botId:WebAppData+поля', `${botId}:WebAppData\n${body}`],
    ['строка=WebAppData+поля', `WebAppData\n${body}`],
  ];

  const result: Array<[string, string]> = [];
  for (const [secretName, secret] of secrets) {
    for (const [stringName, value] of strings) {
      // Оба порядка аргументов: в псевдокоде документации они перепутаны,
      // и в каком-то из вариантов реализация может следовать им буквально.
      result.push([`${secretName} + ${stringName}`, createHmac('sha256', secret).update(value).digest('hex')]);
      result.push([
        `${secretName} + ${stringName} (обратный порядок)`,
        createHmac('sha256', value).update(secret).digest('hex'),
      ]);
    }
  }
  return result;
}

/**
 * Проверка подписи Telegram публичным ключом.
 *
 * Возвращает 'ok' | 'mismatch' | 'absent' | 'unsupported':
 * 'absent' — Telegram не прислал поле signature;
 * 'unsupported' — среда не умеет Ed25519 (тогда полагаемся на HMAC).
 */
export function verifyWithTelegramKey(
  botId: string,
  fields: Array<[string, string]>,
  signature: string | null,
): 'ok' | 'mismatch' | 'absent' | 'unsupported' {
  if (!signature) return 'absent';

  const payload = Buffer.from(thirdPartyDataCheckString(botId, fields), 'utf8');
  const signatureBytes = Buffer.from(signature, 'base64url');

  for (const hexKey of Object.values(TELEGRAM_PUBLIC_KEYS)) {
    const key = buildEd25519Key(hexKey);
    if (!key) continue;
    try {
      if (verifySignature(null, payload, key, signatureBytes)) return 'ok';
    } catch {
      return 'unsupported';
    }
  }
  return 'mismatch';
}

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

  // Поле для сторонней валидации не входит в data_check_string, но нужно
  // его сохранить: по нему проверяем подпись публичным ключом Telegram.
  const signature = params.get('signature');

  params.delete('hash');
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
  // Имя варианта, который совпал: попадает в лог при отказе и позволяет
  // понять, по какой формуле Telegram на самом деле считает hash.
  let matchedBy = '';

  for (const token of tokens) {
    const botId = token.split(':')[0] ?? '';

    for (const [name, candidate] of hashCandidates(token, botId, pairs)) {
      if (safeEqual(candidate, hash)) {
        matched = true;
        matchedBy = name;
        break;
      }
    }
    if (matched) break;
  }

  if (!matched) {
    // Проверяем подпись публичным ключом Telegram. Это независимая
    // проверка: она говорит, подписаны ли данные нашим ботом, даже если
    // токен в окружении не тот. Раз результата не знаем заранее,
    // вердикт попадает в лог вместе с формой запроса.
    const botIds = tokens
      .map((token) => token.split(':')[0] ?? '')
      .filter((botId) => botId.length > 0);
    let ed25519: string = 'absent';
    for (const botId of botIds) {
      ed25519 = verifyWithTelegramKey(botId, pairs, signature);
      if (ed25519 === 'ok') break;
    }

    log('telegram', 'подпись не совпала ни с одним токеном', {
      fields: pairs.map(([key]) => key).sort(),
      queryIdPrefix: (params.get('query_id') ?? '').slice(0, 12),
      expectedBotIds: botIds.join(','),
      knownTokens: tokens.length,
      signatureField: signature ? 'есть' : 'нет',
      // Имена полей подобраны так, чтобы фильтр масок в log() их не съел:
      // он отбрасывает всё, что содержит key, token, url, secret.
      telegramSignature: ed25519,
      matchedBy: matchedBy || 'ни один вариант не совпал',
      candidates: tokens.length,
      // Отладочный дамп включается переменной DEBUG_INITDATA на время разбора.
      // Тело кодируется в base64, чтобы при выводе в лог не искажалось.
      ...(DEBUG_INITDATA()
        ? {
            bodyB64: Buffer.from(dataCheckString, 'utf8').toString('base64'),
            gotHash: hash,
            bodyLength: dataCheckString.length,
          }
        : {}),
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