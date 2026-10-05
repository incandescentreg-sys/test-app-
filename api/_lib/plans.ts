/**
 * Тарифы: источник цен.
 *
 * Фронтенд не содержит ни одной цены — он показывает то, что вернул
 * `GET /plans`. Поэтому цены живут только в таблице `plans` и правятся
 * SQL-запросом или админкой, без деплоя фронтенда.
 */

import type { Plan } from '@prisma/client';
import { prisma } from './prisma';

export interface PlanDto {
  id: string;
  name: string;
  durationDays: number;
  /** Копейки. */
  price: number;
  currency: string;
  pricePerMonth: number | null;
  originalPrice: number | null;
  badge: string | null;
  description: string | null;
  isPopular: boolean;
  available: boolean;
}

export function toPlanDto(plan: Plan): PlanDto {
  // Цена за месяц, если не задана явно: 90 дней ≈ 3 месяца.
  const months = Math.max(1, Math.round(plan.durationDays / 30));
  const pricePerMonth =
    plan.pricePerMonth ?? Math.round(plan.price / months);

  return {
    id: plan.id,
    name: plan.name,
    durationDays: plan.durationDays,
    price: plan.price,
    currency: plan.currency,
    pricePerMonth,
    originalPrice: plan.originalPrice,
    badge: plan.badge,
    description: plan.description,
    isPopular: plan.isPopular,
    available: plan.available,
  };
}

export async function listPlans(): Promise<PlanDto[]> {
  const plans = await prisma.plan.findMany({
    where: { available: true },
    orderBy: { sortOrder: 'asc' },
  });
  return plans.map(toPlanDto);
}

/** Тариф по id. null, если тарифа нет или он отключён. */
export async function findPlan(planId: string): Promise<Plan | null> {
  if (!planId || planId.length > 64) return null;
  return prisma.plan.findFirst({ where: { id: planId, available: true } });
}

/** Набор тарифов по умолчанию для сидирования. */
export const DEFAULT_PLANS: Array<Omit<PlanDto, 'pricePerMonth'>> = [
  {
    id: 'plan-1m',
    name: '1 месяц',
    durationDays: 30,
    price: 14900,
    currency: 'RUB',
    originalPrice: null,
    badge: null,
    description: 'Быстрый старт',
    isPopular: false,
    available: true,
  },
  {
    id: 'plan-3m',
    name: '3 месяца',
    durationDays: 90,
    price: 41900,
    currency: 'RUB',
    originalPrice: 44700,
    badge: 'Выгодно',
    description: 'Оптимальный выбор',
    isPopular: true,
    available: true,
  },
  {
    id: 'plan-6m',
    name: '6 месяцев',
    durationDays: 180,
    price: 71900,
    currency: 'RUB',
    originalPrice: 89400,
    badge: '−20%',
    description: 'Максимальная выгода',
    isPopular: false,
    available: true,
  },
];

/** Идемпотентное наполнение таблицы тарифов. Существующие цены не трогает. */
export async function seedPlans(): Promise<void> {
  for (const [index, plan] of DEFAULT_PLANS.entries()) {
    await prisma.plan.upsert({
      where: { id: plan.id },
      create: { ...plan, sortOrder: index },
      update: {},
    });
  }
}