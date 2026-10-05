/**
 * GET /subscription — состояние подписки.
 *
 * Остаток дней и статус считает backend: клиент не решает, действует ли доступ.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prepare, sendError, sendOk } from './_lib/http.ts';
import { syncFromPanel, toSubscriptionDto } from './_lib/subscription.ts';
import { requireAuth } from './_lib/telegram.ts';
import { loadBundle } from './_lib/user.ts';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'GET') {
      return sendError(res, new Error('Method Not Allowed'), 'subscription');
    }

    const auth = requireAuth(req);
    const { subscription } = await loadBundle(auth);

    const fresh = await syncFromPanel(subscription, auth.user.id);
    sendOk(res, toSubscriptionDto(fresh));
  } catch (error) {
    sendError(res, error, 'subscription');
  }
}