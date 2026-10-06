/**
 * Ручная выдача подписки без curl — просто `npm run provision -- <telegramId>`.
 *
 * Скрипт читает api/.env, поэтому токен и секреты руками вводить не нужно.
 *
 * Примеры:
 *   npm.cmd run provision -- 123456789              тариф plan-1m (30 дней)
 *   npm.cmd run provision -- 123456789 plan-3m
 *   npm.cmd run provision -- 123456789 plan-1m 90   90 дней поверх тарифа
 *
 * Повторный запуск с тем же id ПРОДЛЕВАЕТ подписку, а не создаёт вторую.
 */

import { prisma } from '../api/lib/prisma.ts';
import { clientNameFor, fetchClient } from '../api/lib/h1vless.ts';
import { findPlan } from '../api/lib/plans.ts';
import { grantAccess } from '../api/lib/subscription.ts';

const [rawId, planId = 'plan-1m', rawDays] = process.argv.slice(2);

if (!rawId) {
  console.error('\nУкажите Telegram id пользователя:\n  npm.cmd run provision -- 123456789 plan-1m\n');
  process.exit(1);
}

const telegramId = Number(rawId);
if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
  console.error(`Не похоже на Telegram id: ${rawId}`);
  process.exit(1);
}

const overrideDays = rawDays === undefined ? null : Number(rawDays);
if (overrideDays !== null && (!Number.isInteger(overrideDays) || overrideDays <= 0)) {
  console.error(`Некорректное число дней: ${rawDays}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const plan = await findPlan(planId);
  if (!plan) {
    console.error(`Тариф «${planId}» не найден. Сначала выполните: npm run db:seed`);
    process.exit(1);
  }

  const target = overrideDays ? { ...plan, durationDays: overrideDays } : plan;

  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(telegramId) },
    create: { telegramId: BigInt(telegramId), firstName: 'Пользователь' },
    update: {},
  });

  const { subscription, isNew } = await grantAccess(user.id, telegramId, target);
  const client = await fetchClient(clientNameFor(telegramId));

  console.log(`\nГотово. ${isNew ? 'Создана подписка' : 'Продлена подписка'}:`);
  console.log(`  тариф      ${target.name} (${target.durationDays} дней)`);
  console.log(`  действует  до ${subscription.expiresAt?.toISOString() ?? '—'}`);
  console.log(`  клиент     ${client?.name ?? '—'}`);
  console.log(`  на панели  ${client?.status ?? '—'}, осталось ${client?.left_days ?? '—'} дн.`);

  if (client) {
    const link =
      client.links?.xhttp_cdn ??
      client.inbound_links?.[0]?.link ??
      client.sub_url;
    if (link) console.log(`  ссылка     ${link.slice(0, 60)}…`);
  }

  console.log('');
  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error('\nОшибка:', error instanceof Error ? error.message : error);
  process.exit(1);
});