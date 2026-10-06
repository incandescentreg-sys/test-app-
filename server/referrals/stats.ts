/**
 * GET /referrals/stats — рефералы, кошелёк, история вывода.
 *
 * Баланс и минимум вывода считает сервер: фронтенд ничего не копит и не
 * складывает сам.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BOT_USERNAME, CURRENCY } from '../lib/env.js';
import { methodNotAllowed, prepare, sendError, sendOk } from '../lib/http.js';
import { loadReferralStats } from '../lib/referrals.js';
import { requireAuth } from '../lib/telegram.js';
import { loadBundle } from '../lib/user.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'GET') {
      throw methodNotAllowed();
    }

    const auth = requireAuth(req);
    const { user } = await loadBundle(auth);

    sendOk(res, await loadReferralStats(user.id, auth.user.id, BOT_USERNAME(), CURRENCY()));
  } catch (error) {
    sendError(res, error, 'referrals/stats');
  }
}