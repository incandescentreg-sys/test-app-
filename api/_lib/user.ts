/**
 * Инициализация/обновление пользователя по подписанной initData.
 */

import type { Plan, Subscription, User } from '@prisma/client';
import { prisma } from './prisma.ts';
import { parseReferralId, type TelegramAuth } from './telegram.ts';
import { log } from './http.ts';

/** Telegram отдаёт аватар через короткоживущую ссылку t.me/i/userpic — сохраняем её. */
function avatarUrl(auth: TelegramAuth): string | null {
  const url = auth.user.photo_url;
  return url && url.length > 0 ? url : null;
}

/**
 * Upsert пользователя + применение реферального кода.
 *
 * Реферальная связь выставляется ОДИН РАЗ: поле `referredById` не перезаписывается,
 * иначе пользователь мог бы менять пригласившего повторными `startapp=ref_…`.
 */
export async function touchUser(auth: TelegramAuth): Promise<User> {
  const telegramId = BigInt(Math.trunc(auth.user.id));

  const user = await prisma.user.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username: auth.user.username ?? null,
      firstName: auth.user.first_name ?? 'Пользователь',
      lastName: auth.user.last_name ?? null,
      avatarUrl: avatarUrl(auth),
      languageCode: auth.user.language_code ?? null,
    },
    update: {
      username: auth.user.username ?? null,
      firstName: auth.user.first_name ?? 'Пользователь',
      lastName: auth.user.last_name ?? null,
      avatarUrl: avatarUrl(auth),
      languageCode: auth.user.language_code ?? null,
    },
  });

  const invitedBy = parseReferralId(auth.startParam);
  // Нельзя пригласить самого себя и нельзя переписать уже установленного пригласившего.
  if (invitedBy !== null && invitedBy !== auth.user.id && user.referredById === null) {
    const referrer = await prisma.user.findUnique({
      where: { telegramId: BigInt(invitedBy) },
      select: { id: true },
    });
    if (referrer) {
      await prisma.user.update({
        where: { id: user.id },
        data: { referredById: referrer.id },
      });
      log('user', 'referral linked');
    }
  }

  return user;
}

export interface UserBundle {
  user: User;
  subscription: Subscription | null;
  plan: Plan | null;
  /** Кто пригласил текущего пользователя. */
  referrer: Pick<User, 'id' | 'telegramId' | 'firstName' | 'username'> | null;
}

/** Пользователь вместе с подпиской, тарифом и пригласившим. */
export async function loadBundle(auth: TelegramAuth): Promise<UserBundle> {
  const user = await touchUser(auth);

  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });

  const plan = subscription?.planId
    ? await prisma.plan.findUnique({ where: { id: subscription.planId } })
    : null;

  const referrer = user.referredById
    ? await prisma.user.findUnique({
        where: { id: user.referredById },
        select: { id: true, telegramId: true, firstName: true, username: true },
      })
    : null;

  return { user, subscription, plan, referrer };
}