/**
 * Prisma-клиент: один на инстанс.
 *
 * На Vercel каждая функция — отдельный «инстанс», но модуль кэшируется
 * глобально, поэтому в рамках одного Node-процесса клиент создаётся один раз.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;