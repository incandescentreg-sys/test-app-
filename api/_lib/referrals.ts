/**
 * Реферальная программа и кошелёк.
 *
 * Правила:
 *  • бонус начисляется только после подтверждённой оплаты;
 *  • сумма бонуса считается на сервере от `order.amount`;
 *  • баланс = сумма ЗАЧИСЛЕННЫХ начислений минус выведенное;
 *  • заявка на вывод резервирует сумму сразу, чтобы её нельзя было
 *    вывести дважды.
 */

import { prisma } from './prisma.ts';
import { REFERRAL_BONUS_PERCENT } from './env.ts';
import { log } from './http.ts';

/** Ключ реферальной ссылки: t.me/<bot>?start=ref_<telegramId>. */
export function referralLinkFor(botUsername: string, telegramId: number): string {
  return `https://t.me/${botUsername}?start=ref_${telegramId}`;
}

/**
 * Начисляет бонус пригласившему за оплаченный заказ.
 *
 * Повторный вызов для того же заказа ничего не делает: у начисления
 * хранится orderId, а это первичный ключ в смысле идемпотентности.
 */
export async function creditReferralForOrder(
  orderId: string,
  userId: string,
  orderAmount: number,
): Promise<number> {
  const percent = REFERRAL_BONUS_PERCENT();
  if (percent <= 0 || orderAmount <= 0) return 0;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredById: true },
  });
  if (!user?.referredById) return 0;

  const existing = await prisma.referralEarning.findFirst({
    where: { orderId, referrerId: user.referredById },
    select: { id: true },
  });
  if (existing) return 0;

  // Округляем до копеек вниз: нельзя начислить больше, чем оплачено.
  const amount = Math.floor((orderAmount * percent) / 100);

  await prisma.referralEarning.create({
    data: {
      referrerId: user.referredById,
      referredId: userId,
      orderId,
      amount,
      credited: true,
      orderAmount,
    },
  });

  log('referral', 'bonus credited', { amount });
  return amount;
}

export interface ReferralStatsDto {
  invitedCount: number;
  activeCount: number;
  totalEarnings: number;
  balance: number;
  pendingEarnings: number | null;
  bonusPercent: number;
  currency: string;
  referralLink: string;
  recent: Array<{
    userId: number;
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
    earned: number;
    credited: boolean;
    registeredAt: string;
  }>;
  withdrawals: Array<{
    id: string;
    amount: number;
    status: string;
    requisites: string | null;
    createdAt: string;
    processedAt: string | null;
    rejectionReason: string | null;
  }>;
}

/**
 * Доступный баланс: все зачисленные начисления минус то, что уже ушло
 * в выплаченные или ожидающие выплаты заявки.
 */
export async function loadBalance(userId: string): Promise<{
  balance: number;
  totalEarnings: number;
  pendingEarnings: number;
}> {
  const [earned, withdrawn] = await Promise.all([
    prisma.referralEarning.aggregate({
      where: { referrerId: userId, credited: true },
      _sum: { amount: true },
    }),
    prisma.withdrawal.aggregate({
      where: { userId, status: { in: ['pending', 'approved', 'paid'] } },
      _sum: { amount: true },
    }),
  ]);

  const total = earned._sum.amount ?? 0;
  const held = withdrawn._sum.amount ?? 0;

  const holdAggregate = await prisma.referralEarning.aggregate({
    where: { referrerId: userId, credited: false },
    _sum: { amount: true },
  });

  return {
    balance: Math.max(0, total - held),
    totalEarnings: total,
    pendingEarnings: holdAggregate._sum.amount ?? 0,
  };
}

/** Полная статистика рефералов: список приглашённых, кошелёк, история вывода. */
export async function loadReferralStats(
  userId: string,
  telegramId: number,
  botUsername: string,
  currency: string,
): Promise<ReferralStatsDto> {
  const invited = await prisma.user.findMany({
    where: { referredById: userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      telegramId: true,
      firstName: true,
      username: true,
      avatarUrl: true,
      createdAt: true,
      subscription: { select: { expiresAt: true, frozen: true } },
    },
  });

  const earnings = await prisma.referralEarning.findMany({
    where: { referrerId: userId },
    orderBy: { createdAt: 'desc' },
    select: { referredId: true, amount: true, credited: true },
  });

  const earnedByUser = new Map<string, { amount: number; credited: boolean }>();
  for (const item of earnings) {
    const prev = earnedByUser.get(item.referredId);
    earnedByUser.set(item.referredId, {
      amount: (prev?.amount ?? 0) + item.amount,
      credited: (prev?.credited ?? true) && item.credited,
    });
  }

  const now = Date.now();
  const activeCount = invited.filter(
    (item) =>
      item.subscription !== null &&
      !item.subscription.frozen &&
      item.subscription.expiresAt !== null &&
      item.subscription.expiresAt.getTime() > now,
  ).length;

  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const wallet = await loadBalance(userId);

  return {
    invitedCount: invited.length,
    activeCount,
    totalEarnings: wallet.totalEarnings,
    balance: wallet.balance,
    pendingEarnings: wallet.pendingEarnings,
    bonusPercent: REFERRAL_BONUS_PERCENT(),
    currency,
    referralLink: referralLinkFor(botUsername, telegramId),
    recent: invited.map((item) => {
      const bonus = earnedByUser.get(String(item.telegramId));
      return {
        userId: Number(item.telegramId),
        displayName: item.firstName,
        username: item.username,
        avatarUrl: item.avatarUrl,
        earned: bonus?.amount ?? 0,
        credited: bonus?.credited ?? false,
        registeredAt: item.createdAt.toISOString(),
      };
    }),
    withdrawals: withdrawals.map((item) => ({
      id: item.id,
      amount: item.amount,
      status: item.status,
      // Реквизиты не отдаём целиком: это банковские данные.
      requisites: maskRequisites(item.requisites),
      createdAt: item.createdAt.toISOString(),
      processedAt: item.processedAt?.toISOString() ?? null,
      rejectionReason: item.rejectionReason,
    })),
  };
}

/** Показываем только последние 4 символа реквизитов. */
export function maskRequisites(value: string): string {
  if (value.length <= 4) return '••••';
  return `•••• ${value.slice(-4)}`;
}