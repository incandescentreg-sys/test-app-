/**
 * GET /subscription — состояние подписки.
 *
 * Остаток дней и статус считает backend: клиент не решает, действует ли доступ.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { methodNotAllowed, prepare, sendError, sendOk } from './lib/http.js';
import { syncFromPanel, toSubscriptionDto } from './lib/subscription.js';
import { requireAuth } from './lib/telegram.js';
import { loadBundle } from './lib/user.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'GET') {
      throw methodNotAllowed();
    }

    const auth = requireAuth(req);
    const { subscription } = await loadBundle(auth);

    const fresh = await syncFromPanel(subscription, auth.user.id);
    sendOk(res, toSubscriptionDto(fresh));
  } catch (error) {
    sendError(res, error, 'subscription');
  }
}