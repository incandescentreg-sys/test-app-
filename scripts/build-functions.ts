/**
 * Сборка функций для Vercel.
 *
 * Vercel превращает в функцию КАЖДЫЙ файл в каталоге /api — и падает на
 * деплое, если такой файл не является обработчиком. Поэтому исходники
 * лежат в server/, а сюда попадают только готовые одиночные .js.
 *
 * Зачем бандлить, если можно просто положить рядом .ts:
 *   • файлы вне /api не компилируются — в рантайме не будет .js;
 *   • импорт './lib/http.ts' не разрешится: на диске лежит .js, а не .ts;
 *   • внутри /api любой .ts без default-экспорта ломает деплой.
 * Один файл на функцию снимает все три проблемы разом.
 *
 * Запуск: npm run build:functions
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const ROOT = process.cwd();
const SRC = join(ROOT, 'server');
const OUT = join(ROOT, 'api');

/** Маршрут → файл-обработчик. Порядок важен: /me раньше /me/profile. */
const ROUTES: Array<[string, string]> = [
  ['api/health', 'server/health.ts'],
  ['api/me/profile', 'server/me/profile.ts'],
  ['api/me', 'server/me.ts'],
  ['api/plans', 'server/plans.ts'],
  ['api/subscription', 'server/subscription.ts'],
  ['api/payments/create', 'server/payments/create.ts'],
  ['api/payments/[id]/status', 'server/payments/[id]/status.ts'],
  ['api/vpn/config', 'server/vpn/config.ts'],
  ['api/referrals/stats', 'server/referrals/stats.ts'],
  ['api/withdrawals/create', 'server/withdrawals/create.ts'],
  ['api/webhooks/payment', 'server/webhooks/payment.ts'],
  ['api/admin/provision', 'server/admin/provision.ts'],
];

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  for (const [route, file] of ROUTES) {
    const outfile = join(ROOT, `${route}.js`);
    mkdirSync(dirname(outfile), { recursive: true });

    await build({
      entryPoints: [join(SRC, file.replace(/^server\//, ''))],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node22',
      // node_modules остаются внешними: Prisma со своим движком и .prisma/client
      // Vercel подтягивает сам, а копировать их в бандл нельзя.
      packages: 'external',
      sourcemap: false,
      minify: false,
      logLevel: 'error',
    });

    console.log(`  ✓ ${route}`);
  }

  // package.json рядом с функциями: без "type": "module" Node примет
  // сгенерированный .js за CommonJS и упадёт на import.
  writeFileSync(
    join(OUT, 'package.json'),
    `${JSON.stringify({ type: 'module' }, null, 2)}\n`,
    'utf8',
  );
  console.log(`  ✓ api/package.json (type: module)`);
  console.log(`\nСобрано ${ROUTES.length} функций в api/\n`);
}

void main();