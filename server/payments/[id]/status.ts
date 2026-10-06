/**
 * GET /payments/:id/status — статус заказа для опроса с фронтенда.
 *
 * Фронтенд только опрашивает: он не может решить, что оплата прошла.
 * Статус `paid` выставляет исключительно webhook (см. /api/webhooks/payment).
 *
 * Заказ читается только его владельцем — userId берётся из подписи,
 * а не из параметров запроса.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { methodNotAllowed, prepare, sendError, sendOk, validation } from '../../lib/http.js';
import { loadOrderStatus } from '../../lib/payments.js';
import { requireAuth } from '../../lib/telegram.js';
import { touchUser } from '../../lib/user.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'GET') {
      throw methodNotAllowed();
    }

    const auth = requireAuth(req);
    const user = await touchUser(auth);

    const raw = req.query?.id;
    const orderId = Array.isArray(raw) ? raw[0] : raw;
    if (typeof orderId !== 'string' || orderId.length === 0 || orderId.length > 64) {
      throw validation('Некорректный идентификатор заказа.');
    }

    sendOk(res, await loadOrderStatus(user.id, orderId));
  } catch (error) {
    sendError(res, error, 'payments/status');
  }
}