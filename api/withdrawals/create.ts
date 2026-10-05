/**
 * POST /withdrawals/create — заявка на вывод средств.
 *
 * Тело: `{ amount, requisites }`, сумма в копейках.
 *
 * Все проверки — на сервере. Фронтенд проверяет только для удобства,
 * и его проверки можно обойти:
 *   • amount >= MIN_WITHDRAWAL_AMOUNT (из /health);
 *   • amount <= доступный баланс;
 *   • нет другой заявки в обработке;
 *   • реквизиты заполнены и выглядят правдоподобно.
 */

import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CURRENCY, MIN_WITHDRAWAL_AMOUNT } from '../_lib/env.ts';
import { ApiError, prepare, readJson, sendError, sendOk, validation } from '../_lib/http.ts';
import { prisma } from '../_lib/prisma.ts';
import { requireAuth } from '../_lib/telegram.ts';
import { touchUser } from '../_lib/user.ts';

/** Сумма должна быть целым числом копеек и разумного размера. */
function parseAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw validation('Введите корректную сумму.');
  }
  if (value <= 0) throw validation('Введите корректную сумму.');
  if (value > 100_000_000) throw validation('Сумма слишком велика.');
  return value;
}

function parseRequisites(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_REQUISITES', 'Укажите корректные реквизиты.');
  }
  const cleaned = value.trim();
  // 5…128 символов: карта, СБП или номер счёта.
  if (cleaned.length < 5 || cleaned.length > 128) {
    throw new ApiError(400, 'INVALID_REQUISITES', 'Укажите корректные реквизиты.');
  }
  // Допускаем цифры, пробелы и дефисы — остальное почти всегда опечатка или мусор.
  if (!/^[\d\s-]+$/.test(cleaned)) {
    throw new ApiError(400, 'INVALID_REQUISITES', 'Укажите корректные реквизиты.');
  }
  return cleaned;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (prepare(req, res)) return;

  try {
    if (req.method !== 'POST') {
      return sendError(res, new Error('Method Not Allowed'), 'withdrawals/create');
    }

    const auth = requireAuth(req);
    const user = await touchUser(auth);

    const body = await readJson<{ amount?: unknown; requisites?: unknown }>(req);
    const amount = parseAmount(body.amount);
    const requisites = parseRequisites(body.requisites);

    const minimum = MIN_WITHDRAWAL_AMOUNT();
    if (amount < minimum) {
      throw new ApiError(
        400,
        'MIN_WITHDRAWAL_NOT_REACHED',
        `Минимальная сумма вывода — ${(minimum / 100).toFixed(0)} ₽.`,
      );
    }

    // Проверка заявок и баланса — в одной транзакции, иначе два параллельных
    // запроса могли бы вывести одну и ту же сумму дважды.
    const result = await prisma.$transaction(async (tx) => {
      const pending = await tx.withdrawal.findFirst({
        where: { userId: user.id, status: { in: ['pending', 'approved'] } },
        select: { id: true },
      });
      if (pending) {
        throw new ApiError(
          409,
          'WITHDRAWAL_PENDING_EXISTS',
          'У вас уже есть заявка на вывод в обработке.',
        );
      }

      const earned = await tx.referralEarning.aggregate({
        where: { referrerId: user.id, credited: true },
        _sum: { amount: true },
      });
      const held = await tx.withdrawal.aggregate({
        where: { userId: user.id, status: { in: ['pending', 'approved', 'paid'] } },
        _sum: { amount: true },
      });

      const balance = Math.max(0, (earned._sum.amount ?? 0) - (held._sum.amount ?? 0));
      if (amount > balance) {
        throw new ApiError(400, 'BALANCE_TOO_LOW', 'Недостаточно средств на балансе.');
      }

      const withdrawal = await tx.withdrawal.create({
        data: {
          id: `wd_${randomBytes(5).toString('hex')}`,
          userId: user.id,
          amount,
          requisites,
          status: 'pending',
        },
      });

      return { withdrawal, balance };
    });

    sendOk(
      res,
      {
        withdrawal: {
          id: result.withdrawal.id,
          amount: result.withdrawal.amount,
          status: result.withdrawal.status,
          // Реквизиты не возвращаем целиком: это банковские данные.
          requisites: `•••• ${requisites.slice(-4)}`,
          createdAt: result.withdrawal.createdAt.toISOString(),
          processedAt: null,
          rejectionReason: null,
        },
        balance: result.balance,
        currency: CURRENCY(),
      },
      201,
    );
  } catch (error) {
    sendError(res, error, 'withdrawals/create');
  }
}