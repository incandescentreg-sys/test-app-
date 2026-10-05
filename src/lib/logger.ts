/**
 * Логгер с принудительным редактированием секретов (п. 10: «никогда не
 * отправляй приватную VPN-конфигурацию в публичные логи»).
 *
 * Правила:
 *  • vless:// / vmess:// / trojan:// / ss:// маскируются всегда;
 *  • Telegram initData маскируется всегда;
 *  • токены/ключи в URL и заголовках маскируются;
 *  • в production логи уровня debug/warn глушатся, остаётся только error.
 */

/** Что никогда не должно попасть в лог в открытом виде. */
const SECRET_SCHEMES = [
  'vless',
  'vmess',
  'trojan',
  'ss',
  'hysteria2',
  'hy2',
  'tuic',
  'wireguard',
];

const SECRET_KEYS = [
  'initdata',
  'init_data',
  'authorization',
  'token',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'apikey',
  'api_key',
  'secret',
  'password',
  'privatekey',
  'private_key',
  'realityprivatekey',
  'h1vless',
  'bot_token',
  'bottoken',
];

export function maskSecretString(input: string): string {
  if (!input) return input;
  let out = input;

  // Конфигурации VPN целиком
  for (const scheme of SECRET_SCHEMES) {
    const re = new RegExp(`${scheme}://[^\\s"'<>]+`, 'gi');
    out = out.replace(re, `${scheme}://***`);
  }

  // query-параметры вида ?token=... & key=...
  out = out.replace(
    /([?&])([a-z0-9_\-]*(?:token|secret|key|password|signature|hash)[a-z0-9_\-]*)=([^&\s"']+)/gi,
    (_m, sep: string, k: string) => `${sep}${k}=***`,
  );

  // JSON-поля с секретами
  out = out.replace(
    /("(?:[a-z0-9_\-]*(?:token|secret|password|privateKey|initData)[a-z0-9_\-]*)"\s*:\s*")([^"]{4,})"/gi,
    (_m, key: string) => `${key}***"`,
  );

  return out;
}

function maskUnknown(input: unknown, depth = 0): unknown {
  if (depth > 4) return '[…]';
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return maskSecretString(input);
  if (typeof input === 'number' || typeof input === 'boolean') return input;
  if (input instanceof Error) {
    return { name: input.name, message: maskSecretString(input.message) };
  }
  if (Array.isArray(input)) return input.slice(0, 20).map((v) => maskUnknown(v, depth + 1));
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>).slice(0, 30)) {
      if (SECRET_KEYS.includes(k.toLowerCase())) {
        out[k] = '***';
      } else {
        out[k] = maskUnknown(v, depth + 1);
      }
    }
    return out;
  }
  return '[unserializable]';
}

const isProd = import.meta.env.PROD;

/** Единая точка логирования. Ни один модуль не должен звать console напрямую. */
export const logger = {
  debug(scope: string, data?: unknown): void {
    if (isProd) return;
    console.debug(`[${scope}]`, maskUnknown(data));
  },
  info(scope: string, data?: unknown): void {
    if (isProd) return;
    console.info(`[${scope}]`, maskUnknown(data));
  },
  warn(scope: string, data?: unknown): void {
    if (isProd) return;
    console.warn(`[${scope}]`, maskUnknown(data));
  },
  /** Ошибки логируются всегда, но тоже в маскированном виде. */
  error(scope: string, data?: unknown): void {
    console.error(`[${scope}]`, maskUnknown(data));
  },
};