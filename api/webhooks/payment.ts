/**
 * POST /webhooks/payment — подтверждение оплаты.
 *
 * Единственное место, где заказ переходит в `paid`. Фронтенд не может
 * этого сделать: он только опрашивает статус.
 *
 * ⚠️ Сейчас платежи выключены (PAYMENTS_ENABLED=false), поэтому этот маршрут
 *    служебный: он подтверждает заказ по секрету. Это позволяет вручную
 *    выдать подписку при тестировании и закрыть вопрос «оплата прошла,
 *    а доступа нет» без ожидания провайдера.
 *
 * Когда подключите настоящего провайдера, этот же маршрут будет вызываться
 * его webhook'ом — контракт с фронтендом не изменится.
 *
 * Авторизация: заголовок `X-Webhook-Secret` (или поле `secret` в теле)
 * с значением WEBHOOK_SECRET.
 */

import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { WEBHOOK_SECRET } from '../_lib/env';
import { ApiError, prepare, readJson, sendError, sendOk, unauthorized, validation } from '../_lib/http';
import { settleOrder } from '../_lib/payments';
import { prisma } from '../_lib/prisma';

/** Сравнение секрета за постоянное время. Пустой WEBHOOK_SECRET закрывает маршрут. */
function secretMatches(provided: unknown): boolean {
  const expected = WEBHOOK_SECRET();
  if (!expected) return false;
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'POST') {
      return sendError(res, new Error('Method Not Allowed'), 'webhooks/payment');
    }

    const body = await readJson<{ orderId?: unknown; status?: unknown; secret?: unknown }>(req);

    const header = req.headers['x-webhook-secret'];
    const fromHeader = Array.isArray(header) ? header[0] : header;
    if (!secretMatches(fromHeader) && !secretMatches(body.secret)) {
      throw unauthorized('Некорректный секрет webhook.');
    }

    if (typeof body.orderId !== 'string' || body.orderId.length === 0 || body.orderId.length > 64) {
      throw validation('Не передан orderId.');
    }

    const order = await prisma.order.findUnique({
      where: { id: body.orderId },
      select: { id: true, userId: true },
    });
    if (!order) {
      throw new ApiError(404, 'NOT_FOUND', 'Заказ не найден.');
    }

    const rawStatus = typeof body.status === 'string' ? body.status.toLowerCase() : 'paid';
    const isPaid = ['paid', 'succeeded', 'success', 'confirmed'].includes(rawStatus);

    if (!isPaid) {
      // Неуспешные статусы фиксируем, но доступ не выдаём.
      const mapped = rawStatus === 'failed' ? 'failed' : 'cancelled';
      if (['canceled', 'cancelled', 'failed', 'expired'].includes(rawStatus)) {
        await prisma.order.updateMany({
          where: { id: order.id, status: { not: 'paid' } },
          data: { status: mapped },
        });
      }
      return sendOk(res, { ok: true, orderId: order.id, status: mapped, vpnActivated: false });
    }

    // Idempotent: повторный webhook ничего не делает.
    const settled = await settleOrder(order.id);

    return sendOk(res, {
      ok: true,
      orderId: order.id,
      status: settled?.status ?? 'paid',
      vpnActivated: settled?.status === 'paid',
    });
  } catch (error) {
    sendError(res, error, 'webhooks/payment');
  }
}