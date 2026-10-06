/**
 * Ротация ADMIN_SECRET и WEBHOOK_SECRET.
 *
 * Эти два секрета backend генерирует сам, поэтому их можно обновить в любой
 * момент без внешних систем: меняем в server/.env и в Vercel синхронно.
 *
 * Синхронность важна: если значения разойдутся, служебные маршруты
 * /api/admin/provision и /api/webhooks/payment начнут отвечать 401.
 *
 * Что ротация НЕ делает: она не влияет на вход в Mini App. Подпись
 * initData проверяется по BOT_TOKEN, и «сессия истекла» означает
 * расхождение бота, а не этих секретов.
 *
 * Запуск: npm run rotate:secrets
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = process.cwd();
const ENV_FILE = `${ROOT}/server/.env`;

function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

function setVar(text: string, name: string, value: string): string {
  const line = `${name}=${value}`;
  if (new RegExp(`^${name}=`, 'm').test(text)) {
    return text.replace(new RegExp(`^${name}=.*$`, 'm'), line);
  }
  return `${text.replace(/\n*$/, '')}\n${line}\n`;
}

/**
 * vercel.cmd — это пакетная обёртка, поэтому на Windows её нельзя запускать
 * через execFile без оболочки (падает EINVAL). Через exec с shell
 * значение секрета попадает в аргументы командной строки — это видно
 * в списке процессов на несколько секунд, поэтому скрипт годится для
 * локальной работы, но в CI лучше использовать VERCEL_TOKEN.
 */
async function run(name: string, value: string): Promise<boolean> {
  const { exec } = await import('node:child_process');
  const quote = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

  const command = [
    'vercel.cmd env add',
    quote(name),
    'production',
    '--force',
    '--sensitive',
    '--yes',
    '--value',
    quote(value),
  ].join(' ');

  return new Promise((resolve) => {
    exec(command, { cwd: ROOT, windowsHide: true }, (error) => resolve(!error));
  });
}

async function main(): Promise<void> {
  console.log('\nРотация секретов backend\n');

  const admin = newSecret();
  const webhook = newSecret();

  const current = readFileSync(ENV_FILE, 'utf8');
  writeFileSync(ENV_FILE, setVar(setVar(current, 'ADMIN_SECRET', admin), 'WEBHOOK_SECRET', webhook), 'utf8');
  console.log('  server/.env обновлён');

  for (const [name, value] of [
    ['ADMIN_SECRET', admin],
    ['WEBHOOK_SECRET', webhook],
  ] as const) {
    const ok = await run(name, value);
    console.log(`  ${name} в Vercel: ${ok ? 'обновлён' : 'НЕ УДАЛОСЬ'}`);
    if (!ok) process.exit(1);
  }

  console.log('\nЗначения не выводятся: они лежат в server/.env и в Vercel.');
  console.log('Если расходились — служебные маршруты отвечали бы 401, теперь они согласованы.');
  console.log('\nРотация не влияет на вход в Mini App: для этого нужен BOT_TOKEN\n');
}

void main();