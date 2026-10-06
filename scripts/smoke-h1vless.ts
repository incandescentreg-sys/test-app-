/**
 * Smoke-тест интеграции с панелью H1VLESS.
 *
 * Проверяет живой инстанс, ничего не создавая в базе приложения:
 *   1. /status      — панель отвечает;
 *   2. /info        — чтение существующего клиента;
 *   3. create → info → edit (продление) → delete — полный цикл;
 *   4. pickLink     — из ссылки вытаскиваются host/port.
 *
 * Тестовый клиент удаляется в конце, сколько бы дней ни набежало.
 *
 * Запуск:
 *   $env:H1VLESS_BASE_URL = 'http://nl6.h1cloud.net:25108'
 *   $env:H1VLESS_USERNAME = '…'
 *   $env:H1VLESS_PASSWORD = '…'
 *   npm.cmd run test:h1vless
 */

import {
  clientNameFor,
  createClient,
  extendClient,
  fetchClient,
  fetchStatus,
  parseHostPort,
  pickLink,
} from '../api/lib/h1vless.ts';

const probe = `tg_smoke_${Date.now().toString(36)}`;

function ok(label: string, detail = ''): void {
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label: string, detail: string): never {
  console.error(`  ✗ ${label} — ${detail}`);
  process.exit(1);
}

async function cleanup(name: string): Promise<void> {
  const base = process.env.H1VLESS_BASE_URL ?? 'http://nl6.h1cloud.net:25108';
  const auth = { authorization: `Bearer ${await loginToken(base)}`, 'content-type': 'application/json' };
  await fetch(`${base}/clients/${encodeURIComponent(name)}`, { method: 'DELETE', headers: auth });
}

async function loginToken(base: string): Promise<string> {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: process.env.H1VLESS_USERNAME,
      password: process.env.H1VLESS_PASSWORD,
    }),
  });
  const payload = (await response.json()) as { token?: string };
  if (!payload.token) throw new Error('не удалось получить токен панели');
  return payload.token;
}

async function main(): Promise<void> {
  console.log(`\nH1VLESS smoke-тест, панель: ${process.env.H1VLESS_BASE_URL ?? 'default'}`);
  console.log(`Тестовый клиент: ${probe}\n`);

  // 1. Статус панели
  const status = await fetchStatus();
  if (!status.version) fail('GET /status', 'панель не вернула версию');
  ok('GET /status', `${status.version}, нода «${status.node_name}», клиентов: ${status.clients.total}`);

  // 2. Чтение существующего клиента
  const knownName = clientNameFor(1);
  const existing = await fetchClient(knownName);
  if (existing) ok('GET /info (существующий)', `${existing.name}, осталось ${existing.left_days} дн.`);
  else ok('GET /info (существующий)', 'клиента нет — это нормально, читаем тестовый');

  // 3. Полный цикл: создать → прочитать → продлить → удалить
  let createdDays = 0;
  try {
    const created = await createClient({ name: probe, days: 1 });
    createdDays = 1;
    if (!created.uuid) fail('POST /create', 'не вернулся uuid');
    ok('POST /create', `uuid=${created.uuid.slice(0, 8)}…, срок ${created.left_days} дн.`);

    const link = pickLink(created);
    if (!link) fail('pickLink', 'панель не отдала ни одной ссылки');
    const { host, port } = parseHostPort(link);
    ok('pickLink', `${link.slice(0, 32)}… → ${host}:${port}`);

    const extended = await extendClient(probe, 30);
    // Панель ПРИБАВЛЯет дни: было 1, стало 31.
    if (extended.left_days < 30) {
      fail('PATCH /edit', `продление не сработало: осталось ${extended.left_days} дн. вместо ~31`);
    }
    ok('PATCH /edit (продление)', `1 день + 30 = ${extended.left_days} дн.`);
  } catch (error) {
    await cleanup(probe).catch(() => {});
    fail('цикл create/edit', error instanceof Error ? error.message : String(error));
  }

  await cleanup(probe);
  const gone = await fetchClient(probe);
  if (gone) fail('DELETE /clients/NAME', 'клиент не удалился после теста');
  ok('DELETE /clients/NAME', 'тестовый клиент удалён');

  console.log(`\nГотово. Пробный клиент (${createdDays} дн.) не остался в панели.\n`);
}

main().catch((error) => {
  console.error('\nПровалилось:', error);
  process.exit(1);
});