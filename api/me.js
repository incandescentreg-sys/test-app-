// server/lib/env.ts
function required(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u0430\u044F \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F: ${name}`);
  }
  return value.trim();
}
function optional(name, fallback = "") {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}
function num(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
var BOT_TOKEN = () => required("BOT_TOKEN");
var BOT_TOKEN_FALLBACKS = () => optional("BOT_TOKEN_FALLBACKS").split(",").map((value) => value.trim()).filter((value) => value.length > 0 && value !== BOT_TOKEN());
var BOT_USERNAME = () => optional("BOT_USERNAME", "YablokoVPNBot").replace(/^@/, "");
var INIT_DATA_MAX_AGE_SEC = () => num("INIT_DATA_MAX_AGE_SEC", 86400);
var H1VLESS_BASE_URL = () => optional("H1VLESS_BASE_URL", "http://nl6.h1cloud.net:25108").replace(/\/+$/, "");
var H1VLESS_TOKEN = () => optional("H1VLESS_TOKEN");
var H1VLESS_USERNAME = () => optional("H1VLESS_USERNAME");
var H1VLESS_PASSWORD = () => optional("H1VLESS_PASSWORD");
var H1VLESS_NAME_PREFIX = () => optional("H1VLESS_CLIENT_PREFIX", "tg");
var H1VLESS_TIMEOUT_MS = num("H1VLESS_TIMEOUT_MS", 12e3);
var EXPIRING_SOON_DAYS = () => num("EXPIRING_SOON_DAYS", 5);
var DEVICE_LIMIT = () => num("DEVICE_LIMIT", 0);
var TRAFFIC_LIMIT_GB = () => num("TRAFFIC_LIMIT_GB", 0);
var ALLOWED_ORIGINS = () => optional("ALLOWED_ORIGINS").split(",").map((s) => s.trim()).filter(Boolean);

// server/lib/http.ts
var ApiError = class extends Error {
  status;
  code;
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
};
var unauthorized = (message = "\u0421\u0435\u0441\u0441\u0438\u044F \u0438\u0441\u0442\u0435\u043A\u043B\u0430. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435.") => new ApiError(401, "UNAUTHORIZED", message);
var methodNotAllowed = () => new ApiError(405, "METHOD_NOT_ALLOWED", "\u041C\u0435\u0442\u043E\u0434 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F.");
var SENSITIVE_FIELD = /init_?data|token|secret|password|link|url|uuid|key/i;
function log(scope, message, extra) {
  const safe = {};
  const dropped = [];
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (SENSITIVE_FIELD.test(key)) {
      dropped.push(key);
      continue;
    }
    safe[key] = value;
  }
  console.info(`[${scope}] ${message}`, Object.keys(safe).length > 0 ? safe : "");
  if (dropped.length > 0) console.info(`[${scope}] \u0441\u043A\u0440\u044B\u0442\u043E \u043F\u043E\u043B\u0435\u0439 \u043F\u043E \u043C\u0430\u0441\u043A\u0435: ${dropped.join(", ")}`);
}
function logError(scope, message, error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[${scope}] ${message}: ${detail}`);
}
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  const allowed = ALLOWED_ORIGINS();
  if (!allowed.includes(origin) && !allowed.includes("*")) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Telegram-Init-Data");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
}
function sendJson(res, status, body) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).json(body);
}
function sendOk(res, body, status = 200) {
  sendJson(res, status, body);
}
function prepare(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
function sendError(res, error, scope = "api") {
  if (error instanceof ApiError) {
    sendJson(res, error.status, { code: error.code, message: error.message });
    return;
  }
  logError(scope, "unhandled error", error);
  sendJson(res, 500, {
    code: "INTERNAL_ERROR",
    message: "\u0427\u0442\u043E-\u0442\u043E \u043F\u043E\u0448\u043B\u043E \u043D\u0435 \u0442\u0430\u043A. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437."
  });
}

// server/lib/prisma.ts
import { PrismaClient } from "@prisma/client";
var globalForPrisma = globalThis;
var prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
});
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// server/lib/referrals.ts
function referralLinkFor(botUsername, telegramId) {
  return `https://t.me/${botUsername}?start=ref_${telegramId}`;
}

// server/lib/h1vless.ts
var H1VlessError = class extends Error {
  endpoint;
  detail;
  constructor(endpoint, detail) {
    super(`H1VLESS ${endpoint}: ${detail}`);
    this.name = "H1VlessError";
    this.endpoint = endpoint;
    this.detail = detail;
  }
};
var cachedToken = null;
var tokenFetchedAt = 0;
var envTokenRejected = false;
var TOKEN_REFRESH_MS = 30 * 60 * 1e3;
async function apiFetch(path, init) {
  const base = H1VLESS_BASE_URL();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), H1VLESS_TIMEOUT_MS);
  try {
    let token = await getToken();
    const send = async (bearer) => fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${bearer}`,
        ...init?.body ? { "content-type": "application/json" } : {},
        ...init?.headers ?? {}
      }
    });
    let response = await send(token);
    if (response.status === 401 || response.status === 403) {
      if (token === H1VLESS_TOKEN()) envTokenRejected = true;
      cachedToken = null;
      token = await getToken(true);
      response = await send(token);
    }
    const text = await response.text();
    let payload = null;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new H1VlessError(path, `\u043D\u0435-JSON \u043E\u0442\u0432\u0435\u0442 (HTTP ${response.status})`);
      }
    }
    if (!response.ok) {
      const detail = (payload && typeof payload === "object" && "error" in payload ? String(payload.error) : "") || `HTTP ${response.status}`;
      throw new H1VlessError(path, detail);
    }
    return payload ?? {};
  } catch (error) {
    if (error instanceof H1VlessError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new H1VlessError(path, "\u0442\u0430\u0439\u043C\u0430\u0443\u0442 \u043E\u0442\u0432\u0435\u0442\u0430 \u043F\u0430\u043D\u0435\u043B\u0438");
    }
    throw new H1VlessError(path, error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}
async function getToken(force = false) {
  const username = H1VLESS_USERNAME();
  const password = H1VLESS_PASSWORD();
  const canLogin = Boolean(username && password);
  const now = Date.now();
  if (!force && cachedToken && now - tokenFetchedAt < TOKEN_REFRESH_MS) return cachedToken;
  const fromEnv = H1VLESS_TOKEN();
  if (fromEnv && !envTokenRejected) return fromEnv;
  if (!canLogin) {
    throw new H1VlessError(
      "/auth/login",
      "\u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u044B H1VLESS_USERNAME/H1VLESS_PASSWORD, \u0430 H1VLESS_TOKEN \u043D\u0435 \u043F\u0440\u0438\u043D\u044F\u0442 \u043F\u0430\u043D\u0435\u043B\u044C\u044E"
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), H1VLESS_TIMEOUT_MS);
  try {
    const response = await fetch(`${H1VLESS_BASE_URL()}/auth/login`, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username, password })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.token) {
      throw new H1VlessError("/auth/login", `\u043B\u043E\u0433\u0438\u043D \u043D\u0435 \u0443\u0434\u0430\u043B\u0441\u044F (HTTP ${response.status})`);
    }
    cachedToken = payload.token;
    tokenFetchedAt = Date.now();
    log("h1vless", "authenticated");
    return payload.token;
  } catch (error) {
    if (error instanceof H1VlessError) throw error;
    throw new H1VlessError("/auth/login", error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }
}
function clientNameFor(telegramId) {
  return `${H1VLESS_NAME_PREFIX()}${telegramId}`;
}
var NODE_LABEL_TTL_MS = 10 * 60 * 1e3;
async function fetchClient(name) {
  try {
    const payload = await apiFetch(
      `/info?name=${encodeURIComponent(name)}`
    );
    return payload.client ?? null;
  } catch (error) {
    if (error instanceof H1VlessError && /not_found|unknown|404/i.test(error.detail)) return null;
    throw error;
  }
}
function pickLink(client) {
  const candidates = [
    client.link,
    client.links?.xhttp_cdn,
    ...client.links ? Object.values(client.links) : [],
    ...(client.inbound_links ?? []).map((item) => item.link),
    client.subscription_url,
    client.sub_url
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}

// server/lib/subscription.ts
var MS_PER_DAY = 864e5;
function computeStatus(subscription, now = /* @__PURE__ */ new Date()) {
  if (!subscription) return "none";
  if (subscription.frozen) return "frozen";
  if (!subscription.expiresAt) return "pending";
  const remainingMs = subscription.expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) return "expired";
  const soonMs = EXPIRING_SOON_DAYS() * MS_PER_DAY;
  return remainingMs <= soonMs ? "expiring" : "active";
}
function isActive(status) {
  return status === "active" || status === "expiring";
}
function remainingDays(expiresAt, now = /* @__PURE__ */ new Date()) {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY));
}
async function syncFromPanel(subscription, telegramId) {
  if (!subscription) return null;
  const name = subscription.h1vlessName ?? clientNameFor(telegramId);
  let client;
  try {
    client = await fetchClient(name);
  } catch (error) {
    logError("subscription", "panel sync failed", error);
    return subscription;
  }
  if (!client) {
    log("subscription", "client missing on panel");
    return subscription;
  }
  const expiresAt = client.expires_at ? new Date(client.expires_at * 1e3) : null;
  const link = pickLink(client);
  const subUrl = client.sub_url || null;
  const expiryDriftMs = expiresAt ? Math.abs((subscription.expiresAt?.getTime() ?? 0) - expiresAt.getTime()) : 0;
  const changed = subscription.h1vlessUuid !== client.uuid || subscription.h1vlessLink !== link || subscription.h1vlessSubUrl !== subUrl || expiryDriftMs > 1e3;
  if (!changed) return subscription;
  return prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      h1vlessName: client.name,
      h1vlessUuid: client.uuid,
      h1vlessLink: link,
      h1vlessSubUrl: client.sub_url || null,
      ...expiresAt ? { expiresAt } : {},
      h1vlessSyncedAt: /* @__PURE__ */ new Date()
    }
  });
}
function toSubscriptionDto(subscription) {
  return {
    status: computeStatus(subscription),
    planId: subscription?.planId ?? null,
    planName: subscription?.planName ?? null,
    durationDays: subscription?.durationDays ?? null,
    startAt: subscription?.startAt?.toISOString() ?? null,
    expiresAt: subscription?.expiresAt?.toISOString() ?? null,
    remainingDays: remainingDays(subscription?.expiresAt ?? null),
    autoRenew: subscription?.autoRenew ?? false,
    // Трафик и устройства считает панель; в базе их нет — отдаём лимиты.
    trafficUsedGb: null,
    trafficLimitGb: TRAFFIC_LIMIT_GB() || null,
    deviceLimit: DEVICE_LIMIT() || null
  };
}

// server/lib/telegram.ts
import { createHmac, createPublicKey, timingSafeEqual, verify as verifySignature } from "node:crypto";
var AUTH_HEADER = "X-Telegram-Init-Data";
var TELEGRAM_PUBLIC_KEYS = {
  production: "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d",
  test: "40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec"
};
var SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
function thirdPartyDataCheckString(botId, fields) {
  const body = fields.map(([key, value]) => `${key}=${value}`).join("\n");
  return `${botId}:WebAppData
${body}`;
}
function buildEd25519Key(hexKey) {
  try {
    return createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(hexKey, "hex")]),
      format: "der",
      type: "spki"
    });
  } catch {
    return null;
  }
}
function verifyWithTelegramKey(botId, fields, signature) {
  if (!signature) return "absent";
  const payload = Buffer.from(thirdPartyDataCheckString(botId, fields), "utf8");
  const signatureBytes = Buffer.from(signature, "base64url");
  for (const hexKey of Object.values(TELEGRAM_PUBLIC_KEYS)) {
    const key = buildEd25519Key(hexKey);
    if (!key) continue;
    try {
      if (verifySignature(null, payload, key, signatureBytes)) return "ok";
    } catch {
      return "unsupported";
    }
  }
  return "mismatch";
}
function safeEqual(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
function validateInitData(initData) {
  if (!initData || initData.length > 4096) throw unauthorized();
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw unauthorized();
  const signature = params.get("signature");
  params.delete("hash");
  params.delete("signature");
  const pairs = [...params.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join("\n");
  const tokens = [BOT_TOKEN(), ...BOT_TOKEN_FALLBACKS()];
  let matched = false;
  let hashOverPrefixedString = false;
  for (const token of tokens) {
    const secret = createHmac("sha256", "WebAppData").update(token).digest();
    const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
    if (safeEqual(expected, hash)) {
      matched = true;
      break;
    }
    const botId = token.split(":")[0] ?? "";
    if (botId) {
      const withPrefix = thirdPartyDataCheckString(botId, pairs);
      const prefixed = createHmac("sha256", secret).update(withPrefix).digest("hex");
      if (safeEqual(prefixed, hash)) {
        matched = true;
        hashOverPrefixedString = true;
        break;
      }
    }
  }
  if (!matched) {
    const botIds = tokens.map((token) => token.split(":")[0] ?? "").filter((botId) => botId.length > 0);
    let ed25519 = "absent";
    for (const botId of botIds) {
      ed25519 = verifyWithTelegramKey(botId, pairs, signature);
      if (ed25519 === "ok") break;
    }
    log("telegram", "\u043F\u043E\u0434\u043F\u0438\u0441\u044C \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B\u0430 \u043D\u0438 \u0441 \u043E\u0434\u043D\u0438\u043C \u0442\u043E\u043A\u0435\u043D\u043E\u043C", {
      fields: pairs.map(([key]) => key).sort(),
      queryIdPrefix: (params.get("query_id") ?? "").slice(0, 12),
      expectedBotIds: botIds.join(","),
      knownTokens: tokens.length,
      signatureField: signature ? "\u0435\u0441\u0442\u044C" : "\u043D\u0435\u0442",
      // Имена полей подобраны так, чтобы фильтр масок в log() их не съел:
      // он отбрасывает всё, что содержит key, token, url, secret.
      telegramSignature: ed25519,
      hashStyle: hashOverPrefixedString ? "\u0441 \u043F\u0440\u0435\u0444\u0438\u043A\u0441\u043E\u043C bot_id" : "\u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u043B\u044F",
      candidates: tokens.length
    });
    throw unauthorized();
  }
  const authDate = Number(params.get("auth_date") ?? "0");
  if (!Number.isFinite(authDate) || authDate <= 0) throw unauthorized();
  const ageSec = Math.floor(Date.now() / 1e3) - authDate;
  if (ageSec > INIT_DATA_MAX_AGE_SEC()) throw unauthorized();
  if (ageSec < -300) throw unauthorized();
  let user;
  try {
    user = JSON.parse(params.get("user") ?? "");
  } catch {
    throw unauthorized();
  }
  if (!user || typeof user.id !== "number" || !Number.isFinite(user.id)) throw unauthorized();
  return {
    user,
    startParam: params.get("start_param"),
    authDate,
    raw: initData
  };
}
function requireAuth(req) {
  const header = req.headers[AUTH_HEADER.toLowerCase()];
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw || typeof raw !== "string") {
    throw unauthorized("\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0447\u0435\u0440\u0435\u0437 Telegram.");
  }
  return validateInitData(raw);
}
function parseReferralId(startParam) {
  if (!startParam) return null;
  const match = /^ref_(\d{1,20})$/.exec(startParam.trim());
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// server/lib/user.ts
function avatarUrl(auth) {
  const url = auth.user.photo_url;
  return url && url.length > 0 ? url : null;
}
async function touchUser(auth) {
  const telegramId = BigInt(Math.trunc(auth.user.id));
  const user = await prisma.user.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username: auth.user.username ?? null,
      firstName: auth.user.first_name ?? "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C",
      lastName: auth.user.last_name ?? null,
      avatarUrl: avatarUrl(auth),
      languageCode: auth.user.language_code ?? null
    },
    update: {
      username: auth.user.username ?? null,
      firstName: auth.user.first_name ?? "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C",
      lastName: auth.user.last_name ?? null,
      avatarUrl: avatarUrl(auth),
      languageCode: auth.user.language_code ?? null
    }
  });
  const invitedBy = parseReferralId(auth.startParam);
  if (invitedBy !== null && invitedBy !== auth.user.id && user.referredById === null) {
    const referrer = await prisma.user.findUnique({
      where: { telegramId: BigInt(invitedBy) },
      select: { id: true }
    });
    if (referrer) {
      await prisma.user.update({
        where: { id: user.id },
        data: { referredById: referrer.id }
      });
      log("user", "referral linked");
    }
  }
  return user;
}
async function loadBundle(auth) {
  const user = await touchUser(auth);
  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id }
  });
  const plan = subscription?.planId ? await prisma.plan.findUnique({ where: { id: subscription.planId } }) : null;
  const referrer = user.referredById ? await prisma.user.findUnique({
    where: { id: user.referredById },
    select: { id: true, telegramId: true, firstName: true, username: true }
  }) : null;
  return { user, subscription, plan, referrer };
}

// server/me.ts
async function handler(req, res) {
  if (prepare(req, res)) return;
  try {
    if (req.method !== "GET") {
      throw methodNotAllowed();
    }
    const auth = requireAuth(req);
    const telegramId = auth.user.id;
    const { user, subscription } = await loadBundle(auth);
    const fresh = await syncFromPanel(subscription, telegramId);
    const vpnActive = isActive(computeStatus(fresh));
    const orders = await prisma.order.count({
      where: { userId: user.id, status: "paid" }
    });
    sendOk(res, {
      id: Number(user.telegramId),
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      avatarUrl: user.avatarUrl,
      languageCode: user.languageCode,
      createdAt: user.createdAt.toISOString(),
      // Ссылку собирает backend: клиент её не конструирует и не редактирует.
      referralLink: referralLinkFor(BOT_USERNAME(), telegramId),
      vpnActive,
      // Полезно для отладки на панели, не показывается в интерфейсе.
      subscription: toSubscriptionDto(fresh),
      paidOrders: orders
    });
  } catch (error) {
    sendError(res, error, "me");
  }
}
export {
  handler as default
};
