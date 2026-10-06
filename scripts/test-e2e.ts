/**
 * Сквозной тест backend: Telegram initData → все маршруты → панель H1VLESS.
 *
 * Поднимает обработчики из `api/` поверх HTTP-сервера, генерирует валидную
 * подписанную initData тем же HMAC, которым подписывает Telegram, и проходит
 * весь пользовательский путь:
 *
 *   /health → /plans → /me → /me/profile → /subscription
 *   → /payments/create (503: оплата выключена)
 *   → ручная выдача подписки через панель → /vpn/config
 *   → продление → /referrals/stats → /withdrawals/create
 *
 * Требует запущенную базу (npm run db:local) и доступ к панели.
 * Клиент в панели удаляется в конце — тест не оставляет следов.
 *
 * Запуск:
 *   $env:DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/vpn'
 *   $env:BOT_TOKEN = '…'
 *   $env:H1VLESS_BASE_URL / H1VLESS_USERNAME / H1VLESS_PASSWORD
 *   $env:ADMIN_SECRET = 'test-secret'
 *   npm.cmd run test:e2e
 */

import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

import { prisma } from '../server/lib/prisma.ts';
import { clientNameFor } from '../server/lib/h1vless.ts';
import { createDevResponse } from './_devResponse.ts';

const BOT_TOKEN = process.env.BOT_TOKEN ?? '';
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'test-secret';
const PORT = 4599;

if (!BOT_TOKEN) {
  console.error('\nBOT_TOKEN не задан — тест не сможет подписать initData.\n');
  process.exit(1);
}

const TG_ID = 999_000_111;
const BASE = `http://127.0.0.1:${PORT}/api`;

let passed = 0;
let failed = 0;

/**
 * Строка выводится и в консоль, и в отчётный файл: консоль Windows
 * часто ломает кириллицу, а по файлу результат читается без потерь.
 */
const report: string[] = [];
const REPORT_FILE = join(process.cwd(), 'e2e-report.txt');

function emit(line: string): void {
  report.push(line);
  console.log(line);
}

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed += 1;
    emit(`  [OK]   ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    emit(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string): void {
  emit(`\n${title}`);
}

/** initData, подписанная так же, как это делает Telegram. */
function buildInitData(userId: number, startParam?: string): string {
  const params: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify({ id: userId, first_name: 'Тест', username: 'e2e_tester' }),
  };
  if (startParam) params.start_param = startParam;

  const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  return new URLSearchParams({ ...params, hash }).toString();
}

async function api(
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string>; auth?: boolean },
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers: Record<string, string> = { accept: 'application/json', ...init?.headers };
  if (init?.auth !== false) headers['x-telegram-init-data'] = buildInitData(TG_ID);
  if (init?.body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
}

async function startServer(): Promise<() => Promise<void>> {
  const routes: Array<[RegExp, string]> = [
    [/^\/api\/health$/, 'server/health.ts'],
    [/^\/api\/me\/profile$/, 'server/me/profile.ts'],
    [/^\/api\/me$/, 'server/me.ts'],
    [/^\/api\/plans$/, 'server/plans.ts'],
    [/^\/api\/subscription$/, 'server/subscription.ts'],
    [/^\/api\/payments\/create$/, 'server/payments/create.ts'],
    [/^\/api\/payments\/([^/]+)\/status$/, 'server/payments/[id]/status.ts'],
    [/^\/api\/vpn\/config$/, 'server/vpn/config.ts'],
    [/^\/api\/referrals\/stats$/, 'server/referrals/stats.ts'],
    [/^\/api\/withdrawals\/create$/, 'server/withdrawals/create.ts'],
    [/^\/api\/admin\/provision$/, 'server/admin/provision.ts'],
  ];

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
      for (const [pattern, modulePath] of routes) {
        if (!pattern.test(url.pathname)) continue;

        const imported = await import(pathToFileURL(join(process.cwd(), modulePath)).href);
        const handler = imported.default as (r: unknown, s: unknown) => Promise<void>;

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString('utf8');

        // Vercel кладёт и search-параметры, и динамические сегменты пути
        // в req.query — повторяем именно это поведение.
        const match = pattern.exec(url.pathname);
        const query: Record<string, string> = Object.fromEntries(url.searchParams);
        if (match?.[1]) query.id = match[1];

        const request = Object.assign(req, {
          body: raw ? JSON.parse(raw) : undefined,
          query,
        });

        await handler(request, createDevResponse(res));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ code: 'NOT_FOUND' }));
    })().catch((error) => {
      console.error('[e2e]', error);
      if (!res.headersSent) res.statusCode = 500;
      res.end(JSON.stringify({ code: 'INTERNAL_ERROR' }));
    });
  });

  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}

/** Токен панели: из env или свежий логин. */
async function panelToken(): Promise<string> {
  if (process.env.H1VLESS_TOKEN) return process.env.H1VLESS_TOKEN;
  const response = await fetch(`${process.env.H1VLESS_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: process.env.H1VLESS_USERNAME,
      password: process.env.H1VLESS_PASSWORD,
    }),
  });
  const payload = (await response.json()) as { token: string };
  return payload.token;
}

/**
 * Чистит состояние тестового пользователя: в базе и на панели.
 *
 * Без этого прогон не был бы повторяемым — прошлая подписка осталась бы
 * в базе, и проверки «подписки ещё нет» падали бы.
 */
async function resetTestUser(): Promise<void> {
  const token = await panelToken();
  await fetch(`${process.env.H1VLESS_BASE_URL}/clients/${encodeURIComponent(clientNameFor(TG_ID))}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => undefined);

  // Каскад удалит подписку, заказы, начисления и заявки.
  await prisma.user.deleteMany({ where: { telegramId: BigInt(TG_ID) } });
}

async function main(): Promise<void> {
  const clientName = clientNameFor(TG_ID);
  emit(`\nСквозной тест backend. Telegram id: ${TG_ID}, клиент панели: ${clientName}\n`);

  emit('Готовлю чистое состояние…');
  await resetTestUser();

  const stop = await startServer();

  try {
    /* ── Живость ─────────────────────────────────────────────────────── */
    section('GET /health (без авторизации)');
    {
      const r = await api('/health', { auth: false });
      check('отвечает 200', r.status === 200, `HTTP ${r.status}`);
      check('ok: true', r.body?.ok === true);
      check(
        'минимум вывода в копейках',
        r.body?.app?.minWithdrawalAmount === 50000,
        `${r.body?.app?.minWithdrawalAmount}`,
      );
      check(
        'оплата выключена',
        Array.isArray(r.body?.app?.paymentProviders) && r.body.app.paymentProviders.length === 0,
      );
      check(
        'Cache-Control запрещает кеш',
        r.headers.get('cache-control')?.includes('no-store') === true,
        r.headers.get('cache-control') ?? 'заголовка нет',
      );
    }

    /* ── Авторизация ─────────────────────────────────────────────────── */
    section('Авторизация');
    {
      const r = await api('/me', { auth: false });
      check('без initData → 401', r.status === 401, `HTTP ${r.status}`);
      check('код UNAUTHORIZED', r.body?.code === 'UNAUTHORIZED');
    }
    {
      const r = await fetch(`${BASE}/me`, {
        headers: { 'x-telegram-init-data': `hash=deadbeef&auth_date=${Math.floor(Date.now() / 1000)}&user=%7B%22id%22%3A1%7D` },
      });
      check('поддельная подпись → 401', r.status === 401, `HTTP ${r.status}`);
    }

    /* ── Тарифы ──────────────────────────────────────────────────────── */
    section('GET /plans');
    {
      const r = await api('/plans');
      check('отвечает 200', r.status === 200, `HTTP ${r.status}`);
      const plans = r.body as Array<Record<string, unknown>>;
      check('три тарифа', Array.isArray(plans) && plans.length === 3, `${plans?.length}`);
      check('цены в копейках', plans?.[0]?.price === 14900, `${plans?.[0]?.price}`);
      check('есть pricePerMonth', typeof plans?.[0]?.pricePerMonth === 'number', `${plans?.[0]?.pricePerMonth}`);
    }

    /* ── Пользователь и профиль ──────────────────────────────────────── */
    section('GET /me и /me/profile');
    {
      const r = await api('/me');
      check('отвечает 200', r.status === 200, `HTTP ${r.status}`);
      check('id из подписи', r.body?.id === TG_ID, `${r.body?.id}`);
      check('vpnActive: false', r.body?.vpnActive === false);
      check('реферальная ссылка собрана', String(r.body?.referralLink).includes(`ref_${TG_ID}`), r.body?.referralLink);

      const p = await api('/me/profile');
      check('профиль отвечает 200', p.status === 200, `HTTP ${p.status}`);
      check('статистика пустая', p.body?.stats?.purchaseCount === 0);
      check('кошелёк нулевой', p.body?.referral?.balance === 0);
      check('бонус 20%', p.body?.referral?.bonusPercent === 20);
    }

    /* ── Подписки нет ────────────────────────────────────────────────── */
    section('GET /subscription и /vpn/config без подписки');
    {
      const r = await api('/subscription');
      check('status: none', r.body?.status === 'none', r.body?.status);

      const v = await api('/vpn/config');
      check('конфигурации нет → 404', v.status === 404, `HTTP ${v.status}`);
      check('код SUBSCRIPTION_NOT_FOUND', v.body?.code === 'SUBSCRIPTION_NOT_FOUND');
    }

    /* ── Оплата выключена ────────────────────────────────────────────── */
    section('POST /payments/create (оплата выключена)');
    {
      const r = await api('/payments/create', { method: 'POST', body: { planId: 'plan-1m' } });
      check('503, а не 200', r.status === 503, `HTTP ${r.status}`);
      check('код PAYMENT_UNAVAILABLE', r.body?.code === 'PAYMENT_UNAVAILABLE');
      check(
        'текст честный',
        String(r.body?.message ?? '').includes('временно недоступен'),
        String(r.body?.message ?? ''),
      );

      // Пока оплата выключена, проверка PAYMENTS_ENABLED стоит перед поиском
// тарифа, поэтому даже несуществующий planId даёт 503, а не 422.
      const bad = await api('/payments/create', { method: 'POST', body: { planId: 'нет-такого' } });
      check('выключенная оплата важнее тарифа → 503', bad.status === 503, `HTTP ${bad.status}`);
      check('тот же код PAYMENT_UNAVAILABLE', bad.body?.code === 'PAYMENT_UNAVAILABLE');
    }

    /* ── Ручная выдача подписки ──────────────────────────────────────── */
    section('POST /api/admin/provision (выдача через панель)');
    {
      const noSecret = await fetch(`${BASE}/admin/provision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ telegramId: TG_ID, planId: 'plan-1m' }),
      });
      check('без секрета → 401', noSecret.status === 401, `HTTP ${noSecret.status}`);

      const r = await api('/admin/provision', {
        method: 'POST',
        headers: { 'x-admin-secret': ADMIN_SECRET },
        body: { telegramId: TG_ID, planId: 'plan-1m' },
        auth: false,
      });
      check('отвечает 200', r.status === 200, `HTTP ${r.status}`);
      check('это новая подписка', r.body?.isNew === true);
      check('панель вернула клиента', r.body?.panel?.name === clientName, r.body?.panel?.name);
      check('клиент активен на панели', r.body?.panel?.status === 'active', r.body?.panel?.status);
      // Панель округляет left_days ВНИЗ (floor от остатка секунд), поэтому
      // свежевыданные 30 дней приходят как 29. Проверяем диапазон.
      check(
        'срок на панели ~30 дней',
        typeof r.body?.panel?.leftDays === 'number' && r.body.panel.leftDays >= 29 && r.body.panel.leftDays <= 30,
        `${r.body?.panel?.leftDays}`,
      );
    }

    /* ── Подписка появилась ──────────────────────────────────────────── */
    section('Подписка и конфигурация после выдачи');
    {
      const r = await api('/subscription');
      check('status: active', r.body?.status === 'active', r.body?.status);
      // Наш remainingDays округляется ВВЕРХ: у только что выданных
      // 30 дней пользователь должен видеть 30, а не 29.
      check('осталось 30 дней', r.body?.remainingDays === 30, `${r.body?.remainingDays}`);
      check('тариф plan-1m', r.body?.planId === 'plan-1m');

      const m = await api('/me');
      check('vpnActive: true', m.body?.vpnActive === true);

      const v = await api('/vpn/config');
      check('конфигурация отдаётся', v.status === 200, `HTTP ${v.status}`);
      check('это vless://', String(v.body?.config?.subscriptionUrl).startsWith('vless://'));
      check('хост распознан', typeof v.body?.config?.host === 'string' && v.body.config.host.length > 0, v.body?.config?.host);
      check('список клиентов не пуст', Array.isArray(v.body?.availableClients) && v.body.availableClients.length > 0);
    }

    /* ── Продление ───────────────────────────────────────────────────── */
    section('Продление через админский маршрут');
    {
      const r = await api('/admin/provision', {
        method: 'POST',
        headers: { 'x-admin-secret': ADMIN_SECRET },
        body: { telegramId: TG_ID, planId: 'plan-1m' },
        auth: false,
      });
      check('отвечает 200', r.status === 200, `HTTP ${r.status}`);
      check('это НЕ новая подписка', r.body?.isNew === false);
      // 30 + 30 = 60, но панель округляет вниз: приходит 59.
      const days = r.body?.panel?.leftDays;
      check('срок вырос до ~60', typeof days === 'number' && days >= 59 && days <= 60, `${days}`);

      const sub = await api('/subscription');
      check('у нас 60 дней', sub.body?.remainingDays === 60, `${sub.body?.remainingDays}`);
    }

    /* ── Рефералы и вывод ────────────────────────────────────────────── */
    section('GET /referrals/stats');
    {
      const r = await api('/referrals/stats');
      check('отвечает 200', r.status === 200, `HTTP ${r.status}`);
      check('приглашённых нет', r.body?.invitedCount === 0);
      check('баланс нулевой', r.body?.balance === 0);

      const w = await api('/withdrawals/create', {
        method: 'POST',
        body: { amount: 50000, requisites: '2200 0000 0000 0000' },
      });
      check('вывод при нулевом балансе → 400', w.status === 400, `HTTP ${w.status}`);
      check('код BALANCE_TOO_LOW', w.body?.code === 'BALANCE_TOO_LOW');

      const small = await api('/withdrawals/create', {
        method: 'POST',
        body: { amount: 100, requisites: '2200 0000 0000 0000' },
      });
      check('слишком мало → MIN_WITHDRAWAL_NOT_REACHED', small.body?.code === 'MIN_WITHDRAWAL_NOT_REACHED');

      const bad = await api('/withdrawals/create', {
        method: 'POST',
        body: { amount: 50000, requisites: 'не реквизиты!' },
      });
      check('мусор в реквизитах → INVALID_REQUISITES', bad.body?.code === 'INVALID_REQUISITES');
    }

    /* ── Чужой заказ ─────────────────────────────────────────────────── */
    section('Изоляция данных между пользователями');
    {
      // Короткий id в рамках допустимого формата: 404, а не 400.
      const r = await api('/payments/ord_0000000000000000/status');
      check('чужой/несуществующий заказ → 404', r.status === 404, `HTTP ${r.status}`);
      check('код NOT_FOUND', r.body?.code === 'NOT_FOUND');

      // Заведомо невалидный id: 400 с понятным кодом.
      const malformed = await api(`/payments/${'x'.repeat(100)}/status`);
      check('слишком длинный id → 400', malformed.status === 400, `HTTP ${malformed.status}`);
      check('код VALIDATION_ERROR', malformed.body?.code === 'VALIDATION_ERROR');
    }
  } finally {
    await stop();
  }

  /* ── Уборка ────────────────────────────────────────────────────────── */
  section('Уборка');
  try {
    await resetTestUser();
    const stillThere = await fetch(
      `${process.env.H1VLESS_BASE_URL}/clients/${encodeURIComponent(clientName)}`,
      { headers: { authorization: `Bearer ${await panelToken()}` } },
    );
    check('клиент удалён из панели', !stillThere.ok, `HTTP ${stillThere.status}`);
  } catch (error) {
    console.error(`  ! не удалось удалить ${clientName}:`, error);
  }
  await prisma.$disconnect();

  emit(`\nИтог: ${passed} прошло, ${failed} провалено`);
  emit(`Отчёт: ${REPORT_FILE}\n`);

  // Файл пишем в конце, когда известен полный список проверок.
  writeFileSync(REPORT_FILE, report.join('\n'), 'utf8');

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nТест упал:', error);
  process.exit(1);
});