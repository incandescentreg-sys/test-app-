/**
 * POST /payments/create — создать заказ.
 *
 * Тело: `{ planId }` и ничего больше. Сумму клиент не присылает:
 * backend берёт её из своей базы, поэтому цену нельзя подделать.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prepare, readJson, sendError, sendOk, validation } from '../lib/http.js';
import { createOrder } from '../lib/payments.js';
import { requireAuth } from '../lib/telegram.js';
import { touchUser } from '../lib/user.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'POST') {
      return sendError(res, new Error('Method Not Allowed'), 'payments/create');
    }

    const auth = requireAuth(req);
    const user = await touchUser(auth);

    const body = await readJson<{ planId?: unknown }>(req);
    if (body.planId === undefined || body.planId === null) {
      throw validation('Выберите тариф.');
    }

    const order = await createOrder(user.id, body.planId);
    sendOk(res, order, 201);
  } catch (error) {
    sendError(res, error, 'payments/create');
  }
}