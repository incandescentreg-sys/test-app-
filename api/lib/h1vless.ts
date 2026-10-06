/**
 * Клиент панели H1VLESS (Xray).
 *
 * Панель — источник истины по VPN: срок, UUID, трафик, бан. Наша база
 * хранит только бизнес-состояние и ссылку на имя клиента.
 *
 * Фактический API панели (проверено на живом инстансе):
 *   POST   /auth/login                  → { ok, token }
 *   GET    /status                      → состояние ноды и транспорта
 *   GET    /clients                     → все клиенты
 *   GET    /info?name=NAME              → один клиент
 *   POST   /create                      → 201 { ok, client }
 *   PATCH  /edit                        → продление и лимиты
 *   PATCH  /clients/NAME/ban|unban
 *   PATCH  /clients/NAME/reset-traffic
 *   DELETE /clients/NAME
 *
 * Авторизация: `Authorization: Bearer TOKEN` или `X-API-Key: TOKEN`.
 * Токен живёт долго, поэтому кэшируется в памяти инстанса и перелогинивается
 * только после 401.
 */

import {
  H1VLESS_BASE_URL,
  H1VLESS_BAN_ON_REVOKE,
  H1VLESS_NAME_PREFIX,
  H1VLESS_PASSWORD,
  H1VLESS_TIMEOUT_MS,
  H1VLESS_TOKEN,
  H1VLESS_USERNAME,
} from './env.js';
import { log, logError } from './http.js';

/* ── Типы ответа панели ──────────────────────────────────────────────────── */

export interface H1VlessInboundLink {
  id: string;
  tag: string;
  protocol: string;
  network: string;
  security: string;
  port: number;
  link: string;
}

export interface H1VlessClient {
  name: string;
  uuid: string;
  status: string;
  banned: boolean;
  ban_reason: string;
  created_at: number;
  expires_at: number;
  left_seconds: number;
  left_days: number;
  /** Готовая vless://-ссылка (у этого инстанса пустая). */
  link: string;
  /** Сгенерированные панелью ссылки по транспортам. */
  links: Record<string, string> | null;
  inbound_links: H1VlessInboundLink[] | null;
  /** Ссылка на подписку (по UUID). */
  sub_url: string;
  subscription_url: string;
  traffic_used_bytes: number;
  traffic_used_gb: number;
  traffic_limit_bytes: number;
  traffic_limit_gb: number;
  device_limit: number;
  devices_count: number;
  online: boolean;
}

export interface H1VlessStatus {
  node_name: string;
  domain: string;
  version: string;
  transport: { mode: string; xhttp_path?: string };
  reality: { enabled: boolean; public_port: string | number | null };
  clients: { total: number; active: number; expired: number; banned: number };
}

export interface CreateClientInput {
  name: string;
  days: number;
  trafficLimitGb?: number;
  deviceLimit?: number;
}

/* ── HTTP-слой ───────────────────────────────────────────────────────────── */

class H1VlessError extends Error {
  readonly endpoint: string;
  readonly detail: string;

  constructor(endpoint: string, detail: string) {
    super(`H1VLESS ${endpoint}: ${detail}`);
    this.name = 'H1VlessError';
    this.endpoint = endpoint;
    this.detail = detail;
  }
}

/** Токен в памяти инстанса. Переживает холодный старт только до первого логина. */
let cachedToken: string | null = null;
let tokenFetchedAt = 0;

/**
 * Флаг «токен из env не работает».
 *
 * Нужен для живущих деплоев: если панель отозвала выданный при настройке
 * токен, backend не должен молча умирать — у него есть логин и пароль,
 * и он обязан сам переключиться на них. Один раз помечаем токен
 * бракованным и дальше всегда берём новый через /auth/login.
 */
let envTokenRejected = false;

/** Панель логинит редко; refresh не нужен, но подстрахуемся от залипания токена. */
const TOKEN_REFRESH_MS = 30 * 60 * 1000;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = H1VLESS_BASE_URL();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), H1VLESS_TIMEOUT_MS);

  try {
    let token = await getToken();

    const send = async (bearer: string): Promise<Response> =>
      fetch(`${base}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${bearer}`,
          ...(init?.body ? { 'content-type': 'application/json' } : {}),
          ...(init?.headers ?? {}),
        },
      });

    let response = await send(token);

    // Токен протух — перелогиниваемся и повторяем ровно один раз.
    if (response.status === 401 || response.status === 403) {
      // Токен из env, который сам не работает, больше не пробуем:
      // если заданы логин и пароль, заходим через них.
      if (token === H1VLESS_TOKEN()) envTokenRejected = true;
      cachedToken = null;
      token = await getToken(true);
      response = await send(token);
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new H1VlessError(path, `не-JSON ответ (HTTP ${response.status})`);
      }
    }

    if (!response.ok) {
      const detail =
        (payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : '') || `HTTP ${response.status}`;
      throw new H1VlessError(path, detail);
    }

    return (payload ?? {}) as T;
  } catch (error) {
    if (error instanceof H1VlessError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new H1VlessError(path, 'таймаут ответа панели');
    }
    throw new H1VlessError(path, error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Токен для запросов: из env, из кэша или свежий логин.
 *
 * Порядок такой: пробуем готовый токен (он быстрее логина), но если панель
 * его отвергла — переходим на логин. Это позволяет задать в окружении и
 * токен, и пару: пока токен живой, лишнего запроса нет; когда он протухнет,
 * backend сам себя починит, не требуя ручного вмешательства.
 */
async function getToken(force = false): Promise<string> {
  const username = H1VLESS_USERNAME();
  const password = H1VLESS_PASSWORD();
  const canLogin = Boolean(username && password);

  const now = Date.now();
  if (!force && cachedToken && now - tokenFetchedAt < TOKEN_REFRESH_MS) return cachedToken;

  const fromEnv = H1VLESS_TOKEN();
  if (fromEnv && !envTokenRejected) return fromEnv;

  if (!canLogin) {
    // Ни логина, ни рабочего токена — это уже настройка, а не сбой.
    throw new H1VlessError(
      '/auth/login',
      'не заданы H1VLESS_USERNAME/H1VLESS_PASSWORD, а H1VLESS_TOKEN не принят панелью',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), H1VLESS_TIMEOUT_MS);
  try {
    const response = await fetch(`${H1VLESS_BASE_URL()}/auth/login`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const payload = (await response.json().catch(() => null)) as { token?: string } | null;
    if (!response.ok || !payload?.token) {
      throw new H1VlessError('/auth/login', `логин не удался (HTTP ${response.status})`);
    }
    cachedToken = payload.token;
    tokenFetchedAt = Date.now();
    log('h1vless', 'authenticated');
    return payload.token;
  } catch (error) {
    if (error instanceof H1VlessError) throw error;
    throw new H1VlessError('/auth/login', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}

/* ── Публичные операции ──────────────────────────────────────────────────── */

/** Имя клиента в панели для пользователя Telegram. */
export function clientNameFor(telegramId: number): string {
  return `${H1VLESS_NAME_PREFIX()}${telegramId}`;
}

/**
 * Имя ноды для показа пользователю («🇳🇱 Нидерланды»).
 *
 * Кэшируется на 10 минут: значение меняется крайне редко, а `/status`
 * не должен дёргаться на каждом открытии экрана «Ваш VPN».
 */
let nodeLabelCache: { value: string; at: number } | null = null;
const NODE_LABEL_TTL_MS = 10 * 60 * 1000;

export async function fetchNodeLabel(): Promise<string | null> {
  if (nodeLabelCache && Date.now() - nodeLabelCache.at < NODE_LABEL_TTL_MS) {
    return nodeLabelCache.value;
  }
  try {
    const status = await fetchStatus();
    const value = status.node_name;
    if (value) nodeLabelCache = { value, at: Date.now() };
    return value || null;
  } catch {
    // Название ноды — украшение: его отсутствие не должно ломать ответ.
    return nodeLabelCache?.value ?? null;
  }
}

export async function fetchStatus(): Promise<H1VlessStatus> {
  const payload = await apiFetch<{ ok: boolean } & Partial<H1VlessStatus>>('/status');
  return {
    node_name: String(payload.node_name ?? ''),
    domain: String(payload.domain ?? ''),
    version: String(payload.version ?? ''),
    transport: (payload.transport ?? { mode: '' }) as H1VlessStatus['transport'],
    reality: (payload.reality ?? { enabled: false, public_port: null }) as H1VlessStatus['reality'],
    clients: (payload.clients ?? { total: 0, active: 0, expired: 0, banned: 0 }) as H1VlessStatus['clients'],
  };
}

/** Один клиент или null, если его нет. 404 от панели — это не ошибка. */
export async function fetchClient(name: string): Promise<H1VlessClient | null> {
  try {
    const payload = await apiFetch<{ ok: boolean; client: H1VlessClient }>(
      `/info?name=${encodeURIComponent(name)}`,
    );
    return payload.client ?? null;
  } catch (error) {
    if (error instanceof H1VlessError && /not_found|unknown|404/i.test(error.detail)) return null;
    throw error;
  }
}

/**
 * Создаёт клиента. Панель возвращает 201.
 * `days` — срок от «сейчас», поэтому используется только для новой подписки.
 */
export async function createClient(input: CreateClientInput): Promise<H1VlessClient> {
  const body: Record<string, number | string> = { name: input.name, days: Math.max(1, input.days) };
  if (input.trafficLimitGb && input.trafficLimitGb > 0) body.traffic_limit_gb = input.trafficLimitGb;
  if (input.deviceLimit && input.deviceLimit > 0) body.device_limit = input.deviceLimit;

  const payload = await apiFetch<{ ok: boolean; client: H1VlessClient }>('/create', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!payload.client) throw new H1VlessError('/create', 'панель не вернула клиента');
  log('h1vless', 'client created', { days: input.days });
  return payload.client;
}

/**
 * Продлевает существующего клиента.
 *
 * ВАЖНО: панель `PATCH /edit { days: N }` именно ПРИБАВЛЯет N дней
 * к текущему сроку (проверено: 10 дней + 30 → 39 дней), а не задаёт срок заново.
 */
export async function extendClient(name: string, days: number): Promise<H1VlessClient> {
  const payload = await apiFetch<{ ok: boolean; client: H1VlessClient }>('/edit', {
    method: 'PATCH',
    body: JSON.stringify({ name, days: Math.max(1, days) }),
  });
  if (!payload.client) throw new H1VlessError('/edit', 'панель не вернула клиента');
  log('h1vless', 'client extended', { days });
  return payload.client;
}

/** Создаёт клиента, если его нет, иначе продлевает. Основная операция выдачи доступа. */
export async function provisionClient(
  telegramId: number,
  days: number,
  limits?: { trafficLimitGb?: number; deviceLimit?: number },
): Promise<{ client: H1VlessClient; created: boolean }> {
  const name = clientNameFor(telegramId);
  const existing = await fetchClient(name);
  if (existing) {
    return { client: await extendClient(name, days), created: false };
  }
  return {
    client: await createClient({
      name,
      days,
      trafficLimitGb: limits?.trafficLimitGb,
      deviceLimit: limits?.deviceLimit,
    }),
    created: true,
  };
}

export async function banClient(name: string, reason: string): Promise<void> {
  try {
    await apiFetch(`/clients/${encodeURIComponent(name)}/ban`, {
      method: 'PATCH',
      body: JSON.stringify({ reason: reason.slice(0, 200) }),
    });
    log('h1vless', 'client banned');
  } catch (error) {
    logError('h1vless', 'ban failed', error);
  }
}

export async function unbanClient(name: string): Promise<void> {
  try {
    await apiFetch(`/clients/${encodeURIComponent(name)}/unban`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
    log('h1vless', 'client unbanned');
  } catch (error) {
    logError('h1vless', 'unban failed', error);
  }
}

/** Снимает бан, если доступа больше нет. Вызывается при истечении подписки. */
export async function revokeClient(telegramId: number, reason: string): Promise<void> {
  if (!H1VLESS_BAN_ON_REVOKE()) return;
  await banClient(clientNameFor(telegramId), reason);
}

/* ── Ссылки ──────────────────────────────────────────────────────────────── */

/** Хост и порт из vless://-ссылки — для блока «Сервер» на экране «Ваш VPN». */
export function parseHostPort(link: string): { host: string; port: number } {
  try {
    const url = new URL(link);
    return { host: url.hostname, port: Number(url.port) || 443 };
  } catch {
    return { host: '', port: 0 };
  }
}

/**
 * Выбирает ссылку для пользователя.
 *
 * Приоритет:
 *   1. `link` — если панель отдаёт готовую строку;
 *   2. `links.xhttp_cdn` — рабочий транспорт этого инстанса;
 *   3. `inbound_links[0].link` — прямая нода;
 *   4. `sub_url` — подписка (её умеют импортировать Happ и v2rayN).
 *
 * Возвращается null, если панель не отдала ни одной ссылки: тогда честно
 * отвечаем VPN_NOT_READY, а не показываем пользователю пустоту.
 */
export function pickLink(client: H1VlessClient): string | null {
  const candidates = [
    client.link,
    client.links?.xhttp_cdn,
    ...(client.links ? Object.values(client.links) : []),
    ...(client.inbound_links ?? []).map((item) => item.link),
    client.subscription_url,
    client.sub_url,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return null;
}

export { H1VlessError };