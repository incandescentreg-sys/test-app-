/**
 * POST /admin/provision — ручная выдача/продление подписки.
 *
 * Нужно, пока платежи выключены: тарифы видны, оплата недоступна,
 * но доступ выдать/продлить надо. Так же этим маршрутом пользуются для
 * компенсаций и тестов интеграции с панелью H1VLESS.
 *
 * ⚠️ ЗАКРЫТ СЕКРЕТОМ. Не вызывайте из фронтенда: секрет утечёт в бандл.
 *    Формат вызова:
 *
 *      curl -X POST https://<host>/api/admin/provision \
 *        -H "Content-Type: application/json" \
 *        -H "X-Admin-Secret: <ADMIN_SECRET>" \
 *        -d '{"telegramId":123456789,"planId":"plan-1m","days":30}'
 *
 *    `telegramId` — Telegram id пользователя, `days` перекрывает тариф.
 */

import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prepare, readJson, sendError, sendOk, unauthorized, validation } from '../_lib/http.ts';
import { findPlan } from '../_lib/plans.ts';
import { prisma } from '../_lib/prisma.ts';
import { clientNameFor, fetchClient } from '../_lib/h1vless.ts';
import { grantAccess } from '../_lib/subscription.ts';
import { ADMIN_SECRET } from '../_lib/env.ts';

function secretMatches(provided: unknown): boolean {
  const expected = ADMIN_SECRET();
  if (!expected) return false;
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function parseTelegramId(value: unknown): number {
  const id = typeof value === 'string' ? Number(value) : value;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw validation('Передайте корректный telegramId.');
  }
  return id;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'POST') {
      return sendError(res, new Error('Method Not Allowed'), 'admin/provision');
    }

    const header = req.headers['x-admin-secret'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!secretMatches(provided)) {
      throw unauthorized();
    }

    const body = await readJson<{ telegramId?: unknown; planId?: unknown; days?: unknown }>(req);
    const telegramId = parseTelegramId(body.telegramId);

    // Тариф нужен для имени и лимитов; `days` можно перекрыть вручную.
    const planId = typeof body.planId === 'string' && body.planId ? body.planId : 'plan-1m';
    const plan = await findPlan(planId);

    const overrideDays =
      typeof body.days === 'number' && Number.isInteger(body.days) && body.days > 0
        ? body.days
        : null;

    // Плана может не быть в базе (например, ручная выдача до сидирования).
    // Подставляем минимальный объект: grantAccess использует только id и срок.
    const target = plan
      ? { id: plan.id, name: plan.name, durationDays: plan.durationDays }
      : { id: planId, name: 'Ручная выдача', durationDays: overrideDays ?? 30 };

    const effective =
      overrideDays !== null ? { ...target, durationDays: overrideDays } : target;

    // Пользователя может ещё не быть в базе: создаём минимальную запись,
    // чтобы /me и профиль не падали 404 до первого входа в Mini App.
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(telegramId) },
      create: {
        telegramId: BigInt(telegramId),
        firstName: 'Пользователь',
      },
      update: {},
    });

    const { subscription, isNew } = await grantAccess(user.id, telegramId, effective);

    // Панель — источник истины: покажем, что она реально вернула.
    const client = await fetchClient(clientNameFor(telegramId));

    sendOk(res, {
      ok: true,
      telegramId,
      planId: effective.id,
      isNew,
      days: effective.durationDays,
      expiresAt: subscription.expiresAt?.toISOString() ?? null,
      panel: client
        ? {
            name: client.name,
            uuid: client.uuid,
            status: client.status,
            leftDays: client.left_days,
            expiresAt: new Date(client.expires_at * 1000).toISOString(),
          }
        : null,
    });
  } catch (error) {
    sendError(res, error, 'admin/provision');
  }
}