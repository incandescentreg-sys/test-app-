/**
 * GET /plans — тарифы и цены.
 *
 * Единственный источник цен во всём приложении. Фронтенд не содержит
 * ни одной цифры и просто отображает то, что вернул сервер.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prepare, sendError, sendOk } from './_lib/http.ts';
import { listPlans } from './_lib/plans.ts';
import { requireAuth } from './_lib/telegram.ts';
import { touchUser } from './_lib/user.ts';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'GET') {
      return sendError(res, new Error('Method Not Allowed'), 'plans');
    }

    // Тарифы отдаём только авторизованному: попутно регистрируем пользователя
    // и фиксируем реферальную связь из подписанного start_param.
    const auth = requireAuth(req);
    await touchUser(auth);

    const plans = await listPlans();
    sendOk(res, plans);
  } catch (error) {
    sendError(res, error, 'plans');
  }
}