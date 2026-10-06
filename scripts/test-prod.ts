/**
 * Проверка ЗАДЕПЛОЕННОГО backend на test-app-two-blue.vercel.app.
 *
 * Локальные тесты проходили и при этом прод падал, поэтому финальную
 * проверку делаем по-настоящему: подписываем initData тем же HMAC, что и
 * Telegram, используя реальный BOT_TOKEN, и идём по живому API.
 *
 * Проверяется весь путь целиком: подпись, чтение переменных, соединение с
 * PostgreSQL, ответ API.
 *
 * Запуск: npm run test:prod
 */

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ROOT = process.cwd();
const BASE = process.env.PROD_BASE_URL ?? 'https://test-app-two-blue.vercel.app';
const TG_ID = 999_000_111;

/** Читаем BOT_TOKEN из server/.env — он не попадает в вывод. */
function botToken(): string {
  const raw = readFileSync(`${ROOT}/server/.env`, 'utf8');
  const line = raw.split(/\r?\n/).find((l) => l.startsWith('BOT_TOKEN='));
  const value = line?.slice('BOT_TOKEN='.length).trim() ?? '';
  if (!value) throw new Error('BOT_TOKEN не найден в server/.env');
  return value;
}

function buildInitData(token: string, userId: number): string {
  const params: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify({ id: userId, first_name: 'Прод', username: 'prod_check' }),
  };
  const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...params, hash }).toString();
}

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed += 1;
    console.log(`  [OK]   ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(
  path: string,
  initData?: string,
  method: 'GET' | 'POST' = 'GET',
  payload?: unknown,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (initData) headers['x-telegram-init-data'] = initData;
  if (payload !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function main(): Promise<void> {
  const token = botToken();
  const initData = buildInitData(token, TG_ID);

  console.log(`\nПроверка прода: ${BASE}\n`);

  console.log('Публичный маршрут');
  {
    const r = await call('/api/health');
    check('GET /api/health → 200', r.status === 200, `HTTP ${r.status}`);
    check('ok: true', r.body?.ok === true);
    check('минимум вывода 50000', r.body?.app?.minWithdrawalAmount === 50000, `${r.body?.app?.minWithdrawalAmount}`);
    check('оплата выключена', Array.isArray(r.body?.app?.paymentProviders) && r.body.app.paymentProviders.length === 0);
  }

  console.log('Авторизация');
  {
    const none = await call('/api/plans');
    check('без initData → 401', none.status === 401, `HTTP ${none.status}`);
    check('код UNAUTHORIZED', none.body?.code === 'UNAUTHORIZED');

    const forged = await call('/api/plans', 'hash=deadbeef&auth_date=' + Math.floor(Date.now() / 1000) + '&user=%7B%22id%22%3A1%7D');
    check('поддельная подпись → 401', forged.status === 401, `HTTP ${forged.status}`);
  }

  console.log('С подписью: чтение PostgreSQL');
  {
    const r = await call('/api/plans', initData);
    check('GET /api/plans → 200', r.status === 200, `HTTP ${r.status}`);
    check(
      'тарифы загружены',
      Array.isArray(r.body) && r.body.length > 0,
      `пришло: ${Array.isArray(r.body) ? r.body.length : 'не массив'}`,
    );
    if (Array.isArray(r.body) && r.body.length > 0) {
      check('id тарифа', r.body[0]?.id === 'plan-1m', r.body[0]?.id);
      check('цена в копейках', r.body[0]?.price === 14900, `${r.body[0]?.price}`);
    } else {
      console.error('  [FAIL] тарифов нет — база на проде не засеяна (нужен db:seed:prod)');
      failed += 1;
    }
  }

  {
    const r = await call('/api/me', initData);
    check('GET /api/me → 200', r.status === 200, `HTTP ${r.status}`);
    check('id из подписи', r.body?.id === TG_ID, `${r.body?.id}`);
    check('vpnActive: false', r.body?.vpnActive === false);
  }

  {
    const r = await call('/api/subscription', initData);
    check('GET /api/subscription → 200', r.status === 200, `HTTP ${r.status}`);
    check('статус none', r.body?.status === 'none', r.body?.status);
  }

  {
    const r = await call('/api/me/profile', initData);
    check('GET /api/me/profile → 200', r.status === 200, `HTTP ${r.status}`);
    check('кошелёк нулевой', r.body?.referral?.balance === 0, `${r.body?.referral?.balance}`);
  }

  {
    const r = await call('/api/referrals/stats', initData);
    check('GET /api/referrals/stats → 200', r.status === 200, `HTTP ${r.status}`);
  }

  console.log('Оплата выключена');
  {
    const r = await call('/api/payments/create', initData, 'POST', { planId: 'plan-1m' });
    check('POST /api/payments/create → 503', r.status === 503, `HTTP ${r.status}`);
    check('код PAYMENT_UNAVAILABLE', r.body?.code === 'PAYMENT_UNAVAILABLE');
  }

  console.log('Неверный метод');
  {
    const r = await call('/api/payments/create', initData);
    check('GET на POST-маршрут → 405', r.status === 405, `HTTP ${r.status}`);
    check('код METHOD_NOT_ALLOWED', r.body?.code === 'METHOD_NOT_ALLOWED');
  }

  console.log('Служебные маршруты закрыты');
  {
    const r = await call('/api/admin/provision', undefined, 'POST', { telegramId: TG_ID });
    check('admin без секрета → 401', r.status === 401, `HTTP ${r.status}`);

    const w = await call('/api/webhooks/payment', undefined, 'POST', { orderId: 'ord_x' });
    check('webhook без секрета → 401', w.status === 401, `HTTP ${w.status}`);
  }

  console.log(`\nИтог: ${passed} прошло, ${failed} провалено\n`);
  process.exitCode = (failed === 0 ? 0 : 1);
}

void main();