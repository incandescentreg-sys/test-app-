/**
 * Проверка рантайма функций без деплоя.
 *
 * Vercel собирает каждую функцию из api/**\/*.ts в .js и запускает как есть,
 * без бандлинга. Значит импорты должны разрешаться в рантайме, а скомпилированные
 * модули из api/_lib обязаны лежать рядом. Локальный tsx такое скрывает,
 * поэтому повторяем ровно то, что делает Vercel:
 *
 *   1. esbuild переводит все api/**\/*.ts в .js с сохранением структуры;
 *   2. кладём рядом package.json с "type": "module";
 *   3. просим Node импортировать каждую функцию — она валит на битой ссылке.
 *
 * Запуск: npx tsx scripts/verify-runtime.ts
 */

import { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = process.cwd();
// Каталог внутри проекта: Node ищет node_modules вверх по дереву и находит
// настоящий, с корректным @prisma/client. Копировать node_modules в temp
// нельзя — Prisma ломается на неполной копии.
const OUT = join(ROOT, '.verify-runtime');
rmSync(OUT, { recursive: true, force: true });
mkdtempSync(OUT);

/** Точки входа — те же, что Vercel делает функциями. */
const entries: Array<[string, string]> = [
  ['api/health.ts', 'api/health'],
  ['api/me.ts', 'api/me'],
  ['api/me/profile.ts', 'api/me/profile'],
  ['api/subscription.ts', 'api/subscription'],
  ['api/plans.ts', 'api/plans'],
  ['api/payments/create.ts', 'api/payments/create'],
  ['api/payments/[id]/status.ts', 'api/payments/[id]/status'],
  ['api/vpn/config.ts', 'api/vpn/config'],
  ['api/referrals/stats.ts', 'api/referrals/stats'],
  ['api/withdrawals/create.ts', 'api/withdrawals/create'],
  ['api/webhooks/payment.ts', 'api/webhooks/payment'],
  ['api/admin/provision.ts', 'api/admin/provision'],
];

async function main(): Promise<void> {
  console.log(`\nСимуляция сборки Vercel в ${OUT}\n`);

  // 1. Компилируем ВСЕ .ts внутри api/ — именно это делает Vercel для функций.
  //    Точки входа плюс модули из api/lib: если каталог не попадёт в сборку,
  //    импорты разорвутся в рантайме.
  const apiFiles: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) apiFiles.push(full);
    }
  };
  walk(join(ROOT, 'api'));

  await build({
    entryPoints: apiFiles,
    outdir: OUT,
    outbase: ROOT,
    bundle: false, // Vercel не бандлит — это ключевая настройка
    format: 'esm',
    platform: 'node',
    target: 'node22',
    loader: { '.ts': 'ts' },
    logLevel: 'error',
  });

  // 2. package.json с "type": "module" — иначе Node примет .js за CommonJS.
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown>;
  writeFileSync(join(OUT, 'package.json'), JSON.stringify({ type: 'module', dependencies: pkg.dependencies }));

  // 3. Проверяем, что каждый обработчик реально импортируется.
  let broken = 0;
  for (const [, route] of entries) {
    const file = join(OUT, `${route}.js`);
    try {
      const mod = await import(pathToFileURL(file).href);
      const ok = typeof mod.default === 'function';
      if (!ok) {
        broken += 1;
        console.error(`  [FAIL] ${route} — нет default-экспорта`);
      } else {
        console.log(`  [OK]   ${route}`);
      }
    } catch (error) {
      broken += 1;
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      console.error(`  [FAIL] ${route} — ${message}`);
    }
  }

  rmSync(OUT, { recursive: true, force: true });

  console.log(`\nИтог: ${entries.length - broken} из ${entries.length} маршрутов загружаются\n`);
  process.exit(broken === 0 ? 0 : 1);
}

void main();