/**
 * Диагностика авторизации: один вопрос, один ответ.
 *
 * Симптом «сессия истекла» означает, что подпись не сошлась. Причин ровно
 * две, и обе проверяются здесь автоматически:
 *
 *   1. токен в server/.env невалиден — тогда чинить надо токен;
 *   2. токен валиден, но в Vercel лежит другой — тогда Mini App подписан
 *      токеном бота, который отличается от прописанного на сервере.
 *
 * Скрипт подписывает initData тем же токеном и спрашивает у бота, кто он,
 * затем стучится в задеплоенный /api/me. Если там 200 — цепочка целая и
 * дело в другом (например, Mini App открыт из другого бота).
 *
 * Нужен доступ к api.telegram.org — то есть запускать у себя.
 *
 * Запуск: npm run check:auth
 */

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PROD = process.env.PROD_BASE_URL ?? 'https://test-app-two-blue.vercel.app';

function envToken(): string {
  const raw = readFileSync(`${process.cwd()}/server/.env`, 'utf8');
  const line = raw.split(/\r?\n/).find((l) => l.startsWith('BOT_TOKEN='));
  const value = line?.slice('BOT_TOKEN='.length).trim() ?? '';
  if (!value) throw new Error('BOT_TOKEN не найден в server/.env');
  return value;
}

function envUsername(): string | null {
  const raw = readFileSync(`${process.cwd()}/server/.env`, 'utf8');
  const line = raw.split(/\r?\n/).find((l) => l.startsWith('BOT_USERNAME='));
  const value = line?.slice('BOT_USERNAME='.length).trim().replace(/^@/, '') ?? '';
  return value || null;
}

function sign(token: string, userId: number): string {
  const params: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
    user: JSON.stringify({ id: userId, first_name: 'Проверка', username: 'auth_check' }),
  };
  const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...params, hash }).toString();
}

interface BotInfo {
  id: number;
  username: string;
  first_name: string;
}

let step = 0;
let problems = 0;

function ok(text: string): void {
  step += 1;
  console.log(`  ${step}. [ок] ${text}`);
}

/** Сообщает о проблеме и всегда выходит: дальше идти смысла нет. */
function bad(text: string, hint: string): never {
  step += 1;
  problems += 1;
  console.error(`  ${step}. [!!] ${text}`);
  console.error(`      ${hint}`);
  console.error(`\nНайдено проблем: ${problems}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  console.log(`\nДиагностика авторизации\n`);
  const token = envToken();

  // 1. Токен вообще рабочий?
  let bot: BotInfo | null = null;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const payload = (await response.json()) as {
      ok?: boolean;
      result?: BotInfo;
      description?: string;
    };
    if (payload.ok && payload.result) {
      bot = payload.result;
      ok(`токен валиден: @${bot.username} (id ${bot.id})`);
    } else {
      bad(
        `Telegram отверг токен: ${payload.description ?? 'без описания'}`,
        'Возьмите новый токен в BotFather (/revoke) и обновите server/.env и Vercel.',
      );
    }
  } catch {
    bad(
      'нет доступа к api.telegram.org',
      'Проверка требует сеть до Telegram. Включите VPN и запустите ещё раз.',
    );
  }

  if (!bot) {
    bad('токен не определён', 'Повторите после устранения предыдущей ошибки.');
    return;
  }

  const me = bot as BotInfo;

  // 2. Совпадает ли username с тем, что прописан для реферальных ссылок.
  const configured = envUsername();
  if (configured && configured !== me.username) {
    bad(
      `BOT_USERNAME в server/.env = @${configured}, а бот = @${me.username}`,
      'Реферальные ссылки собираются из BOT_USERNAME — исправьте значение.',
    );
  } else if (!configured) {
    console.log(`      подсказка: BOT_USERNAME не задан, реферальные ссылки соберутся с заглушкой`);
    console.log(`      впишите в server/.env и в Vercel: BOT_USERNAME=${me.username}`);
  }

  // 3. Тот же токен принимает ли сервер на проде?
  const initData = sign(token, 999_000_222);
  try {
    const response = await fetch(`${PROD}/api/me`, { headers: { 'x-telegram-init-data': initData } });
    if (response.status === 200) {
      ok('сервер на проде принимает подпись этим токеном');
      console.log(`\nЗначит сервер настроен верно.`);
      console.log(`Если в Telegram всё равно «сессия истекла», Mini App открыт из ДРУГОГО бота.`);
      console.log(`Откройте приложение через кнопку у @${me.username} и убедитесь,`);
      console.log(`что в BotFather → /newapp указан адрес ${PROD}.`);
    } else if (response.status === 401) {
      bad(
        'сервер на проде отверг подпись (401)',
        'В Vercel лежит другой BOT_TOKEN. Обновите его:\n' +
          '      vercel env rm BOT_TOKEN production --yes\n' +
          '      vercel env add BOT_TOKEN production --sensitive --yes --value <новый токен>',
      );
    } else {
      bad(`сервер ответил ${response.status}`, 'Посмотрите логи: vercel logs test-app-two-blue.vercel.app');
    }
  } catch {
    bad('нет доступа к прод-домену', `Проверьте вручную: ${PROD}/api/health`);
  }

  console.log(`\n${problems === 0 ? 'Проблем не найдено' : `Найдено проблем: ${problems}`}\n`);
  process.exitCode = (problems === 0 ? 0 : 1);
}

void main();