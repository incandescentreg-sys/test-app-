/**
 * GET /me/profile — профиль одним запросом.
 *
 * Агрегат: user + subscription + referral + stats.
 * Экономит два round-trip'а на экране «Профиль».
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BOT_USERNAME, CURRENCY } from '../lib/env.js';
import { prepare, sendError, sendOk } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { loadReferralStats, referralLinkFor } from '../lib/referrals.js';
import { isActive, computeStatus, syncFromPanel, toSubscriptionDto } from '../lib/subscription.js';
import { requireAuth } from '../lib/telegram.js';
import { loadBundle } from '../lib/user.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'GET') {
      return sendError(res, new Error('Method Not Allowed'), 'me/profile');
    }

    const auth = requireAuth(req);
    const telegramId = auth.user.id;
    const { user, subscription } = await loadBundle(auth);

    const fresh = await syncFromPanel(subscription, telegramId);
    const referral = await loadReferralStats(user.id, telegramId, BOT_USERNAME(), CURRENCY());

    // Статистика покупок — из заказов, а не из накопленных счётчиков на клиенте.
    const [paidAgg, firstPaid] = await Promise.all([
      prisma.order.aggregate({
        where: { userId: user.id, status: 'paid' },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.order.findFirst({
        where: { userId: user.id, status: 'paid' },
        orderBy: { paidAt: 'asc' },
        select: { paidAt: true, createdAt: true },
      }),
    ]);

    sendOk(res, {
      user: {
        id: Number(user.telegramId),
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        languageCode: user.languageCode,
        createdAt: user.createdAt.toISOString(),
        referralLink: referralLinkFor(BOT_USERNAME(), telegramId),
        vpnActive: isActive(computeStatus(fresh)),
      },
      subscription: toSubscriptionDto(fresh),
      referral,
      stats: {
        totalPaid: paidAgg._sum.amount ?? 0,
        purchaseCount: paidAgg._count._all,
        firstPurchaseAt: (firstPaid?.paidAt ?? firstPaid?.createdAt)?.toISOString() ?? null,
      },
    });
  } catch (error) {
    sendError(res, error, 'me/profile');
  }
}