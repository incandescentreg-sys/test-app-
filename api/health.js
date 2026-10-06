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
function bool(name, fallback = false) {
  const raw = optional(name).toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return fallback;
}
var H1VLESS_TIMEOUT_MS = num("H1VLESS_TIMEOUT_MS", 12e3);
var APP_NAME = () => optional("APP_NAME", "\u042F\u0431\u043B\u043E\u043A\u043E VPN");
var SUPPORT_USERNAME = () => optional("SUPPORT_USERNAME", "").replace(/^@/, "");
var CURRENCY = () => optional("CURRENCY", "RUB");
var MIN_WITHDRAWAL_AMOUNT = () => num("MIN_WITHDRAWAL_AMOUNT", 5e4);
var REFERRAL_BONUS_PERCENT = () => num("REFERRAL_BONUS_PERCENT", 20);
var PAYMENTS_ENABLED = () => bool("PAYMENTS_ENABLED", false);
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
var methodNotAllowed = () => new ApiError(405, "METHOD_NOT_ALLOWED", "\u041C\u0435\u0442\u043E\u0434 \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F.");
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

// server/health.ts
async function handler(req, res) {
  if (prepare(req, res)) return;
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      throw methodNotAllowed();
    }
    sendOk(res, {
      ok: true,
      version: "1.0.0",
      app: {
        name: APP_NAME(),
        // Копейки: 50000 = 500 ₽.
        minWithdrawalAmount: MIN_WITHDRAWAL_AMOUNT(),
        currency: CURRENCY(),
        supportUsername: SUPPORT_USERNAME() || null,
        paymentProviders: PAYMENTS_ENABLED() ? ["pending"] : [],
        referralBonusPercent: REFERRAL_BONUS_PERCENT()
      }
    });
  } catch (error) {
    sendError(res, error, "health");
  }
}
export {
  handler as default
};
