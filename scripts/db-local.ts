/**
 * Локальная база данных без установки PostgreSQL.
 *
 * Поднимает PGlite (Postgres, скомпилированный в WASM) и отдаёт его по
 * обычному wire-протоколу PostgreSQL на порт 5432. К нему подключается
 * Prisma — с той же строкой `DATABASE_URL`, что и у Neon/Supabase.
 *
 * Нужен, чтобы разрабатывать и тестировать локально, не поднимая Postgres
 * в Docker (Docker на Windows это отдельная боль).
 *
 * Данные лежат в `.pglite/` и переживают перезапуск.
 *
 * Запуск:
 *   npm.cmd run db:local
 *
 * В соседнем терминале:
 *   $env:DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/vpn'
 *   npm.cmd run db:push
 *   npm.cmd run db:seed
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const DATA_DIR = join(process.cwd(), '.pglite');
const DB_NAME = 'vpn';
const PORT = 5432;
const USER = 'postgres';
const PASSWORD = 'postgres';

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });

  console.log(`[db:local] запускаю PGlite в ${DATA_DIR}`);

  const db = await PGlite.create({
    dataDir: DATA_DIR,
    // PGlite работает в одном процессе: держим его живым, пока сервер жив.
    relaxedDurability: true,
  });

  // База создаётся лениво при первом подключении, но создадим её явно,
  // чтобы строка подключения работала сразу.
  await db.exec(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`).catch(() => {
    /* уже существует — это нормально */
  });

  const server = new PGLiteSocketServer({
    db,
    port: PORT,
    host: '127.0.0.1',
    // PGlite — однопоточный движок: несколько клиентов обслуживаются
    // последовательно, но ни один не должен отваливаться по таймауту.
    maxConnections: 8,
    idleTimeout: 0,
  });
  await server.start();
  console.log(`[db:local] слушаю postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DB_NAME}`);

  console.log(`[db:local] в соседнем терминале выполните:`);
  console.log(`[db:local]   $env:DATABASE_URL = 'postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DB_NAME}'`);
  console.log(`[db:local]   npm.cmd run db:push`);
  console.log(`[db:local]   npm.cmd run db:seed`);

  const shutdown = async () => {
    console.log('\n[db:local] останавливаюсь…');
    await server.stop().catch(() => {});
    await db.close().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[db:local] не удалось запустить:', error);
  process.exit(1);
});