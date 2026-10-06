import { PrismaClient } from '@prisma/client';
import { DEFAULT_PLANS } from '../server/lib/plans.ts';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const [index, plan] of DEFAULT_PLANS.entries()) {
    // update: {} — существующие цены не перетираются: их правят руками.
    await prisma.plan.upsert({
      where: { id: plan.id },
      create: { ...plan, sortOrder: index },
      update: {},
    });
    console.log(`[seed] план ${plan.id} — ${plan.name}, ${plan.price / 100} ₽`);
  }

  const count = await prisma.user.count();
  console.log(`[seed] готово. Пользователей в базе: ${count}`);
}

main()
  .catch((error) => {
    console.error('[seed] ошибка:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });