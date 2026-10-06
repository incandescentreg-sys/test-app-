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
function bool(name, fallback = false) {
  const raw = optional(name).toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return fallback;
}
var BOT_TOKEN = () => required("BOT_TOKEN");
var INIT_DATA_MAX_AGE_SEC = () => num("INIT_DATA_MAX_AGE_SEC", 86400);
var H1VLESS_TIMEOUT_MS = num("H1VLESS_TIMEOUT_MS", 12e3);
var EXPIRING_SOON_DAYS = () => num("EXPIRING_SOON_DAYS", 5);
var PAYMENTS_ENABLED = () => bool("PAYMENTS_ENABLED", false);
var ORDER_TTL_MINUTES = () => num("ORDER_TTL_MINUTES", 30);
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
function log(scope, message, extra) {
  const safe = {};
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (/init_?data|token|secret|password|link|url|uuid|key/i.test(key)) continue;
    safe[key] = value;
  }
  console.info(`[${scope}] ${message}`, Object.keys(safe).length > 0 ? safe : "");
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

// server/lib/payments.ts
import { randomBytes } from "node:crypto";

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
var TOKEN_REFRESH_MS = 30 * 60 * 1e3;
var NODE_LABEL_TTL_MS = 10 * 60 * 1e3;

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

// server/lib/payments.ts
function newOrderId() {
  return `ord_${randomBytes(6).toString("hex")}`;
}
function toOrderDto(order) {
  return {
    id: order.id,
    planId: order.planId ?? "",
    planName: order.planName,
    durationDays: order.durationDays,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    paymentUrl: order.paymentUrl,
    provider: order.provider ?? "none",
    expiresAt: (order.expiresAt ?? /* @__PURE__ */ new Date()).toISOString(),
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null
  };
}
async function createOrder(userId, planId) {
  if (typeof planId !== "string" || planId.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0430\u0440\u0438\u0444.");
  }
  const plan = await findPlan(planId);
  if (!plan) throw new ApiError(422, "PLAN_UNAVAILABLE", "\u042D\u0442\u043E\u0442 \u0442\u0430\u0440\u0438\u0444 \u0441\u0435\u0439\u0447\u0430\u0441 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0440\u0443\u0433\u043E\u0439.");
  if (!PAYMENTS_ENABLED()) {
    throw new ApiError(
      503,
      "PAYMENT_UNAVAILABLE",
      "\u041F\u0440\u0438\u0451\u043C \u043E\u043F\u043B\u0430\u0442\u044B \u0432\u0440\u0435\u043C\u0435\u043D\u043D\u043E \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u041F\u043E\u043F\u0440\u043E\u0431\u0443\u0439\u0442\u0435 \u043F\u043E\u0437\u0436\u0435."
    );
  }
  const existing = await prisma.order.findFirst({
    where: { userId, status: { in: ["created", "pending"] } },
    orderBy: { createdAt: "desc" }
  });
  if (existing && existing.expiresAt && existing.expiresAt.getTime() > Date.now()) {
    return toOrderDto(existing);
  }
  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  const isRenewal = isActive(computeStatus(subscription));
  const order = await prisma.order.create({
    data: {
      id: newOrderId(),
      userId,
      planId: plan.id,
      planName: plan.name,
      durationDays: plan.durationDays,
      amount: plan.price,
      currency: plan.currency,
      status: "created",
      isRenewal,
      expiresAt: new Date(Date.now() + ORDER_TTL_MINUTES() * 6e4)
    }
  });
  log("payments", "order created");
  return toOrderDto(order);
}

// server/lib/telegram.ts
import { createHmac, timingSafeEqual } from "node:crypto";
var AUTH_HEADER = "X-Telegram-Init-Data";
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
  params.delete("hash");
  params.delete("signature");
  const pairs = [...params.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN()).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeEqual(expected, hash)) throw unauthorized();
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

// server/payments/create.ts
async function handler(req, res) {
  if (prepare(req, res)) return;
  try {
    if (req.method !== "POST") {
      throw methodNotAllowed();
    }
    const auth = requireAuth(req);
    const user = await touchUser(auth);
    const body = await readJson(req);
    if (body.planId === void 0 || body.planId === null) {
      throw validation("\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0442\u0430\u0440\u0438\u0444.");
    }
    const order = await createOrder(user.id, body.planId);
    sendOk(res, order, 201);
  } catch (error) {
    sendError(res, error, "payments/create");
  }
}
export {
  handler as default
};
