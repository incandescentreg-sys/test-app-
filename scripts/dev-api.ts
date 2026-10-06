/**
 * Локальный запуск backend без Vercel CLI.
 *
 * `vercel dev` работает, но требует установки CLI и логина.
 * Этот скрипт поднимает те же обработчики из `api/` на обычном
 * node:http — быстрый цикл разработки, ноль лишних зависимостей.
 *
 * Запуск:
 *   $env:DATABASE_URL = 'postgresql://…'
 *   npm.cmd run dev:node
 *
 * Затем:
 *   http://localhost:3000/api/health          — живость
 *   http://localhost:3000/                     — раздача dist/ (после npm run build)
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDevResponse } from './_devResponse.ts';

const PORT = Number(process.env.PORT ?? 3000);
const DIST = join(process.cwd(), 'dist');

type Handler = (req: any, res: any) => Promise<void> | void;

/** Таблица маршрутов: путь → модуль с default-экспортом. */
const ROUTES: Array<[RegExp, string]> = [
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
  [/^\/api\/webhooks\/payment$/, 'server/webhooks/payment.ts'],
  [/^\/api\/admin\/provision$/, 'server/admin/provision.ts'],
];

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Собирает query-параметры в том же виде, что и Vercel: повторы → массив. */
function buildQuery(url: URL): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else {
      query[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    }
  }
  return query;
}

function readBody(raw: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    raw.on('data', (chunk: Buffer) => chunks.push(chunk));
    raw.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    raw.on('error', reject);
  });
}



async function serveStatic(url: URL, res: ServerResponse): Promise<boolean> {
  if (!existsSync(DIST)) return false;

  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  // normalize + префиксная проверка не дают выйти за пределы dist/.
  const safe = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(DIST, safe);
  if (!filePath.startsWith(DIST)) return false;

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(content);
    return true;
  } catch {
    // SPA-fallback: любой неизвестный путь отдаёт index.html.
    if (!extname(safe)) {
      try {
        const index = await readFile(join(DIST, 'index.html'));
        res.writeHead(200, { 'Content-Type': MIME['.html'] as string });
        res.end(index);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    for (const [pattern, modulePath] of ROUTES) {
      const match = pattern.exec(url.pathname);
      if (!match) continue;

      try {
        const imported = await import(pathToFileURL(join(process.cwd(), modulePath)).href);
        const handler = imported.default as Handler;

        let body: unknown;
        if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
          try {
            body = await readBody(req);
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ code: 'VALIDATION_ERROR', message: 'Некорректный формат запроса.' }));
            return;
          }
        }

        // Vercel-обработчики ждут req с полями body и query — добавляем их.
        const request = Object.assign(req, { body, query: buildQuery(url) }) as unknown;
        await handler(request, createDevResponse(res));
        return;
      } catch (error) {
        console.error(`[dev:api] ${modulePath} ${url.pathname} —`, error);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка.' }));
        }
        return;
      }
    }

    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: 'NOT_FOUND', message: 'Неизвестный маршрут API.' }));
      return;
    }

    if (await serveStatic(url, res)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404. Сначала соберите фронтенд: npm run build');
  })();
});

server.listen(PORT, () => {
  console.log(`[dev:api] http://localhost:${PORT}`);
  console.log(`[dev:api] health:  http://localhost:${PORT}/api/health`);
  console.log(`[dev:api] статика: ${existsSync(DIST) ? DIST : 'нет (запустите npm run build)'}`);
});