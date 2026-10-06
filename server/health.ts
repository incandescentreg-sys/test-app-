/**
 * GET /health — публичная проверка живости.
 *
 * Без авторизации: Mini App вызывает его при старте. Ответ содержит
 * только публичные параметры — никаких токенов и ссылок.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  APP_NAME,
  CURRENCY,
  MIN_WITHDRAWAL_AMOUNT,
  PAYMENTS_ENABLED,
  REFERRAL_BONUS_PERCENT,
  SUPPORT_USERNAME,
} from './lib/env.js';
import { prepare, sendError, sendOk } from './lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendError(res, new Error('Method Not Allowed'), 'health');
    }

    sendOk(res, {
      ok: true,
      version: '1.0.0',
      app: {
        name: APP_NAME(),
        // Копейки: 50000 = 500 ₽.
        minWithdrawalAmount: MIN_WITHDRAWAL_AMOUNT(),
        currency: CURRENCY(),
        supportUsername: SUPPORT_USERNAME() || null,
        paymentProviders: PAYMENTS_ENABLED() ? ['pending'] : [],
        referralBonusPercent: REFERRAL_BONUS_PERCENT(),
      },
    });
  } catch (error) {
    sendError(res, error, 'health');
  }
}