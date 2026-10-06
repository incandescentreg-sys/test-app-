/**
 * Заказы и платежи.
 *
 * Сейчас платежи ВЫКЛЮЧЕНЫ (PAYMENTS_ENABLED=false): тарифы видны,
 * но `POST /payments/create` честно отвечает 503. Так пользователь не
 * платит в никуда и не получает подписку без оплаты.
 *
 * Чтобы включить реальные платежи, достаточно реализовать одну функцию
 * `createProviderPayment` ниже и поставить PAYMENTS_ENABLED=true —
 * контракт с фронтендом не изменится.
 */

import { randomBytes } from 'node:crypto';
import type { Order, Subscription } from '@prisma/client';
import { ORDER_TTL_MINUTES, PAYMENTS_ENABLED } from './env.js';
import { ApiError, log } from './http.js';
import { findPlan } from './plans.js';
import { prisma } from './prisma.js';
import { computeStatus, grantAccess, isActive } from './subscription.js';
import { creditReferralForOrder } from './referrals.js';

/** Короткий публичный id заказа. Не пересекается с внутренними cuid. */
function newOrderId(): string {
  return `ord_${randomBytes(6).toString('hex')}`;
}

export interface OrderDto {
  id: string;
  planId: string;
  planName: string;
  durationDays: number;
  /** Копейки. */
  amount: number;
  currency: string;
  status: string;
  paymentUrl: string | null;
  provider: string;
  expiresAt: string;
  createdAt: string;
  paidAt: string | null;
}

export function toOrderDto(order: Order): OrderDto {
  return {
    id: order.id,
    planId: order.planId ?? '',
    planName: order.planName,
    durationDays: order.durationDays,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    paymentUrl: order.paymentUrl,
    provider: order.provider ?? 'none',
    expiresAt: (order.expiresAt ?? new Date()).toISOString(),
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
  };
}

/**
 * Создание заказа.
 *
 * Клиент присылает ТОЛЬКО planId. Цена берётся из своей базы, поэтому
 * стоимость нельзя подделать ни телом запроса, ни подменой JS на клиенте.
 */
export async function createOrder(userId: string, planId: unknown): Promise<OrderDto> {
  if (typeof planId !== 'string' || planId.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Выберите тариф.');
  }

  const plan = await findPlan(planId);
  if (!plan) throw new ApiError(422, 'PLAN_UNAVAILABLE', 'Этот тариф сейчас недоступен. Выберите другой.');

  if (!PAYMENTS_ENABLED()) {
    // Честный отказ: лучше «временно недоступно», чем оплата в никуда.
    throw new ApiError(
      503,
      'PAYMENT_UNAVAILABLE',
      'Приём оплаты временно недоступен. Попробуйте позже.',
    );
  }

  // Не даём плодить заказы: один незавершённый заказ на пользователя.
  const existing = await prisma.order.findFirst({
    where: { userId, status: { in: ['created', 'pending'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (existing && existing.expiresAt && existing.expiresAt.getTime() > Date.now()) {
    return toOrderDto(existing);
  }

  const subscription = await prisma.subscription.findUnique({ where: { userId } });
  const isRenewal = isActive(computeStatus(subscription));

  const order = await prisma.order.create({
    data: {
      id: newOrderId(),
      userId,
      planId: plan.id,
      planName: plan.name,
      durationDays: plan.durationDays,
      amount: plan.price,
      currency: plan.currency,
      status: 'created',
      isRenewal,
      expiresAt: new Date(Date.now() + ORDER_TTL_MINUTES() * 60_000),
    },
  });

  // Здесь появится вызов провайдера:
  //   const payment = await createProviderPayment(order);
  //   order = await prisma.order.update({ where: { id: order.id }, data: { paymentUrl: payment.confirmationUrl, provider: payment.provider } });
  log('payments', 'order created');

  return toOrderDto(order);
}

/**
 * Подтверждение оплаты и выдача доступа.
 *
 * Вызывается ТОЛЬКО из webhook'а провайдера (или из служебного эндпоинта
 * с секретом) — фронтенд не может сам объявить заказ оплаченным.
 * Идемпотентно: повторный вызов ничего не делает.
 */
export async function settleOrder(orderId: string): Promise<Order | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  // Уже оплачен — повторный webhook ничего не делает.
  if (order.status === 'paid') return order;

  const user = await prisma.user.findUnique({ where: { id: order.userId } });
  if (!user) return null;

  const plan = order.planId ? await findPlan(order.planId) : null;
  if (!plan) {
    log('payments', 'plan missing for order');
    return null;
  }

  const paid = await prisma.order.update({
    where: { id: order.id },
    data: { status: 'paid', paidAt: new Date() },
  });

  // Доступ выдаём только после фиксации оплаты.
  await grantAccess(user.id, Number(user.telegramId), plan);

  await creditReferralForOrder(order.id, user.id, order.amount);

  return paid;
}

export interface PaymentStatusDto {
  orderId: string;
  status: string;
  amount: number;
  currency: string;
  paidAt: string | null;
  vpnActivated: boolean;
  subscription: unknown | null;
  failureReason: string | null;
}

/**
 * Статус заказа для опроса с фронтенда.
 *
 * Заказ читается только его владельцем: подставляем userId в условие,
 * иначе любой авторизованный пользователь узнал бы чужой заказ по id.
 */
export async function loadOrderStatus(userId: string, orderId: string): Promise<PaymentStatusDto> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: { user: { select: { id: true } } },
  });
  if (!order) throw new ApiError(404, 'NOT_FOUND', 'Заказ не найден.');

  // Просроченный заказ честно помечаем истёкшим, а не «pending» навсегда.
  let status = order.status;
  if (
    (status === 'created' || status === 'pending') &&
    order.expiresAt !== null &&
    order.expiresAt.getTime() < Date.now()
  ) {
    status = 'expired';
  }

  let subscription: Subscription | null = null;
  if (order.user) {
    subscription = await prisma.subscription.findUnique({ where: { userId: order.user.id } });
  }

  const subStatus = computeStatus(subscription);

  return {
    orderId: order.id,
    status,
    amount: order.amount,
    currency: order.currency,
    paidAt: order.paidAt?.toISOString() ?? null,
    vpnActivated: status === 'paid' && isActive(subStatus),
    subscription: subscription
      ? {
          status: subStatus,
          planId: subscription.planId,
          planName: subscription.planName,
          durationDays: subscription.durationDays,
          startAt: subscription.startAt?.toISOString() ?? null,
          expiresAt: subscription.expiresAt?.toISOString() ?? null,
        }
      : null,
    failureReason: null,
  };
}