/**
 * Проверка собранных функций БЕЗ деплоя.
 *
 * Загружает каждый файл из api/ так, как это сделает Vercel: Node в ESM,
 * с type: module из api/package.json, и импортированными node_modules из
 * настоящего проекта. Функция падает на битой ссылке или отсутствии
 * default-экспорта — ровно те ошибки, что видны на проде.
 *
 * tsx такие ошибки скрывает: он разрешает импорты как угодно и подменяет
 * окружение. Именно поэтому предыдущие проверки проходили, а прод падал.
 *
 * Запуск: npm run verify:runtime
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const API = join(ROOT, 'api');

/** Все .js внутри api/, кроме корневого package.json. */
function collect(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full, acc);
    else if (entry.name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

async function main(): Promise<void> {
  console.log(`\nПроверка функций из ${API}\n`);

  let broken = 0;
  const files = collect(API).sort();

  for (const file of files) {
    const route = file.slice(API.length + 1).replace(/\\/g, '/').replace(/\.js$/, '');
    try {
      const mod = await import(pathToFileURL(file).href);
      if (typeof mod.default !== 'function') {
        broken += 1;
        console.error(`  [FAIL] ${route} — нет default-экспорта-функции`);
      } else {
        console.log(`  [OK]   ${route}`);
      }
    } catch (error) {
      broken += 1;
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      console.error(`  [FAIL] ${route} — ${message}`);
    }
  }

  console.log(`\nИтог: ${files.length - broken} из ${files.length} функций загружаются\n`);
  process.exit(broken === 0 ? 0 : 1);
}

void main();