/**
 * GET /me — текущий пользователь.
 *
 * Идентичность берётся ТОЛЬКО из подписанной initData. Никакого
 * userId в query или теле: клиент может подделать всё, кроме HMAC.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BOT_USERNAME } from './lib/env.js';
import { prepare, sendError, sendOk } from './lib/http.js';
import { prisma } from './lib/prisma.js';
import { referralLinkFor } from './lib/referrals.js';
import {
  computeStatus,
  isActive,
  syncFromPanel,
  toSubscriptionDto,
} from './lib/subscription.js';
import { requireAuth } from './lib/telegram.js';
import { loadBundle } from './lib/user.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'GET') {
      return sendError(res, new Error('Method Not Allowed'), 'me');
    }

    const auth = requireAuth(req);
    const telegramId = auth.user.id;

    const { user, subscription } = await loadBundle(auth);

    // Панель — источник истины по сроку; сверяем перед ответом.
    const fresh = await syncFromPanel(subscription, telegramId);
    const vpnActive = isActive(computeStatus(fresh));

    const orders = await prisma.order.count({
      where: { userId: user.id, status: 'paid' },
    });

    sendOk(res, {
      id: Number(user.telegramId),
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      avatarUrl: user.avatarUrl,
      languageCode: user.languageCode,
      createdAt: user.createdAt.toISOString(),
      // Ссылку собирает backend: клиент её не конструирует и не редактирует.
      referralLink: referralLinkFor(BOT_USERNAME(), telegramId),
      vpnActive,
      // Полезно для отладки на панели, не показывается в интерфейсе.
      subscription: toSubscriptionDto(fresh),
      paidOrders: orders,
    });
  } catch (error) {
    sendError(res, error, 'me');
  }
}