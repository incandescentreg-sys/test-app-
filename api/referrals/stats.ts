/**
 * GET /referrals/stats — рефералы, кошелёк, история вывода.
 *
 * Баланс и минимум вывода считает сервер: фронтенд ничего не копит и не
 * складывает сам.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BOT_USERNAME, CURRENCY } from '../_lib/env.ts';
import { prepare, sendError, sendOk } from '../_lib/http.ts';
import { loadReferralStats } from '../_lib/referrals.ts';
import { requireAuth } from '../_lib/telegram.ts';
import { loadBundle } from '../_lib/user.ts';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'GET') {
      return sendError(res, new Error('Method Not Allowed'), 'referrals/stats');
    }

    const auth = requireAuth(req);
    const { user } = await loadBundle(auth);

    sendOk(res, await loadReferralStats(user.id, auth.user.id, BOT_USERNAME(), CURRENCY()));
  } catch (error) {
    sendError(res, error, 'referrals/stats');
  }
}