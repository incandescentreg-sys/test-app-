/**
 * Генерация секретов для переменных окружения.
 *
 * Значения берутся из криптостойкого источника, а не из Math.random(),
 * и печатаются в том виде, в котором их нужно вставить.
 *
 * Запуск: npx tsx scripts/gen-secrets.ts
 */

import { randomBytes } from 'node:crypto';

/** URL-безопасная строка из 32 байт энтропии (~256 бит). */
function secret(): string {
  return randomBytes(32).toString('base64url');
}

const adminSecret = secret();
const webhookSecret = secret();

console.log(`
Сгенерированы значения для переменных окружения.
Скопируйте их в Vercel (Settings → Environment Variables) или в api/.env.

────────────────────────────────────────────────────────────────
ADMIN_SECRET
${adminSecret}

WEBHOOK_SECRET
${webhookSecret}
────────────────────────────────────────────────────────────────

Эти значения больше нигде не сохранены: если потеряете — сгенерируйте
новые. Старые после ротации перестанут работать, и служебные
маршруты /api/admin/provision и /api/webhooks/payment будут закрыты.
`);