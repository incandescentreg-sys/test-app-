// server/webhooks/payment.ts
import { timingSafeEqual } from "node:crypto";

// server/lib/env.ts
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
var H1VLESS_BASE_URL = () => optional("H1VLESS_BASE_URL", "http://nl6.h1cloud.net:25108").replace(/\/+$/, "");
var H1VLESS_TOKEN = () => optional("H1VLESS_TOKEN");
var H1VLESS_USERNAME = () => optional("H1VLESS_USERNAME");
var H1VLESS_PASSWORD = () => optional("H1VLESS_PASSWORD");
var H1VLESS_NAME_PREFIX = () => optional("H1VLESS_CLIENT_PREFIX", "tg");
var H1VLESS_TIMEOUT_MS = num("H1VLESS_TIMEOUT_MS", 12e3);
var REFERRAL_BONUS_PERCENT = () => num("REFERRAL_BONUS_PERCENT", 20);
var EXPIRING_SOON_DAYS = () => num("EXPIRING_SOON_DAYS", 5);
var DEVICE_LIMIT = () => num("DEVICE_LIMIT", 0);
var TRAFFIC_LIMIT_GB = () => num("TRAFFIC_LIMIT_GB", 0);
var WEBHOOK_SECRET = () => optional("WEBHOOK_SECRET");
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
var validation = (message = "\u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u044B\u0435 \u043F\u043E\u043B\u044F.") => new ApiError(400, "VALIDATION_ERROR", message);
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
async function readJson(req) {
  const body = req.body;
  if (body && typeof body === "object") return body;
  if (typeof body === "string" && body.length > 0) {
    try {
      const parsed = JSON.parse(body);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      throw validation("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0444\u043E\u0440\u043C\u0430\u0442 \u0437\u0430\u043F\u0440\u043E\u0441\u0430.");
    }
  }
  return {};
}

// server/lib/prisma.ts
import { PrismaClient } from "@prisma/client";
var globalForPrisma = globalThis;
var prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
});
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// server/lib/plans.ts
async function findPlan(planId) {
  if (!planId || planId.length > 64) return null;
  return prisma.plan.findFirst({ where: { id: planId, available: true } });
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
async function createClient(input) {
  const body = { name: input.name, days: Math.max(1, input.days) };
  if (input.trafficLimitGb && input.trafficLimitGb > 0) body.traffic_limit_gb = input.trafficLimitGb;
  if (input.deviceLimit && input.deviceLimit > 0) body.device_limit = input.deviceLimit;
  const payload = await apiFetch("/create", {
    method: "POST",
    body: JSON.stringify(body)
  });
  if (!payload.client) throw new H1VlessError("/create", "\u043F\u0430\u043D\u0435\u043B\u044C \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B\u0430 \u043A\u043B\u0438\u0435\u043D\u0442\u0430");
  log("h1vless", "client created", { days: input.days });
  return payload.client;
}
async function extendClient(name, days) {
  const payload = await apiFetch("/edit", {
    method: "PATCH",
    body: JSON.stringify({ name, days: Math.max(1, days) })
  });
  if (!payload.client) throw new H1VlessError("/edit", "\u043F\u0430\u043D\u0435\u043B\u044C \u043D\u0435 \u0432\u0435\u0440\u043D\u0443\u043B\u0430 \u043A\u043B\u0438\u0435\u043D\u0442\u0430");
  log("h1vless", "client extended", { days });
  return payload.client;
}
async function provisionClient(telegramId, days, limits) {
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
      deviceLimit: limits?.deviceLimit
    }),
    created: true
  };
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
async function grantAccess(userId, telegramId, plan) {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  const wasActive = isActive(computeStatus(existing));
  const isNew = !wasActive;
  const { client } = await provisionClient(telegramId, plan.durationDays, {
    trafficLimitGb: TRAFFIC_LIMIT_GB(),
    deviceLimit: DEVICE_LIMIT()
  });
  const expiresAt = client.expires_at ? new Date(client.expires_at * 1e3) : new Date(Date.now() + plan.durationDays * MS_PER_DAY);
  const startAt = isNew ? new Date((client.created_at || Math.floor(Date.now() / 1e3)) * 1e3) : existing?.startAt ?? /* @__PURE__ */ new Date();
  const link = pickLink(client);
  const subscription = await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planId: plan.id,
      planName: plan.name,
      durationDays: plan.durationDays,
      startAt,
      expiresAt,
      h1vlessName: client.name,
      h1vlessUuid: client.uuid,
      h1vlessLink: link,
      h1vlessSubUrl: client.sub_url || null,
      h1vlessSyncedAt: /* @__PURE__ */ new Date(),
      renewCount: 0
    },
    update: {
      planId: plan.id,
      planName: plan.name,
      durationDays: plan.durationDays,
      // Продление: срок берём ОТ ПАНЕЛИ, а не прибавляем сами.
      expiresAt,
      frozen: false,
      h1vlessName: client.name,
      h1vlessUuid: client.uuid,
      h1vlessLink: link,
      h1vlessSubUrl: client.sub_url || null,
      h1vlessSyncedAt: /* @__PURE__ */ new Date(),
      renewCount: { increment: isNew ? 0 : 1 }
    }
  });
  log("subscription", isNew ? "granted" : "renewed", { days: plan.durationDays });
  return { subscription, isNew };
}

// server/lib/referrals.ts
async function creditReferralForOrder(orderId, userId, orderAmount) {
  const percent = REFERRAL_BONUS_PERCENT();
  if (percent <= 0 || orderAmount <= 0) return 0;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredById: true }
  });
  if (!user?.referredById) return 0;
  const existing = await prisma.referralEarning.findFirst({
    where: { orderId, referrerId: user.referredById },
    select: { id: true }
  });
  if (existing) return 0;
  const amount = Math.floor(orderAmount * percent / 100);
  await prisma.referralEarning.create({
    data: {
      referrerId: user.referredById,
      referredId: userId,
      orderId,
      amount,
      credited: true,
      orderAmount
    }
  });
  log("referral", "bonus credited", { amount });
  return amount;
}

// server/lib/payments.ts
async function settleOrder(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  if (order.status === "paid") return order;
  const user = await prisma.user.findUnique({ where: { id: order.userId } });
  if (!user) return null;
  const plan = order.planId ? await findPlan(order.planId) : null;
  if (!plan) {
    log("payments", "plan missing for order");
    return null;
  }
  const paid = await prisma.order.update({
    where: { id: order.id },
    data: { status: "paid", paidAt: /* @__PURE__ */ new Date() }
  });
  await grantAccess(user.id, Number(user.telegramId), plan);
  await creditReferralForOrder(order.id, user.id, order.amount);
  return paid;
}

// server/webhooks/payment.ts
function secretMatches(provided) {
  const expected = WEBHOOK_SECRET();
  if (!expected) return false;
  if (typeof provided !== "string" || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
async function handler(req, res) {
  if (prepare(req, res)) return;
  try {
    if (req.method !== "POST") {
      throw methodNotAllowed();
    }
    const body = await readJson(req);
    const header = req.headers["x-webhook-secret"];
    const fromHeader = Array.isArray(header) ? header[0] : header;
    if (!secretMatches(fromHeader) && !secretMatches(body.secret)) {
      throw unauthorized("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u0441\u0435\u043A\u0440\u0435\u0442 webhook.");
    }
    if (typeof body.orderId !== "string" || body.orderId.length === 0 || body.orderId.length > 64) {
      throw validation("\u041D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u043D orderId.");
    }
    const order = await prisma.order.findUnique({
      where: { id: body.orderId },
      select: { id: true, userId: true }
    });
    if (!order) {
      throw new ApiError(404, "NOT_FOUND", "\u0417\u0430\u043A\u0430\u0437 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D.");
    }
    const rawStatus = typeof body.status === "string" ? body.status.toLowerCase() : "paid";
    const isPaid = ["paid", "succeeded", "success", "confirmed"].includes(rawStatus);
    if (!isPaid) {
      const mapped = rawStatus === "failed" ? "failed" : "cancelled";
      if (["canceled", "cancelled", "failed", "expired"].includes(rawStatus)) {
        await prisma.order.updateMany({
          where: { id: order.id, status: { not: "paid" } },
          data: { status: mapped }
        });
      }
      return sendOk(res, { ok: true, orderId: order.id, status: mapped, vpnActivated: false });
    }
    const settled = await settleOrder(order.id);
    return sendOk(res, {
      ok: true,
      orderId: order.id,
      status: settled?.status ?? "paid",
      vpnActivated: settled?.status === "paid"
    });
  } catch (error) {
    sendError(res, error, "webhooks/payment");
  }
}
export {
  handler as default
};
