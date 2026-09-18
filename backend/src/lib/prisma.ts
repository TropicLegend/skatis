import { PrismaClient } from '@prisma/client';
import { isProduction } from '../config/env.js';

// Reuse a single client across hot reloads (tsx watch) and test files.
const globalForPrisma = globalThis as unknown as { __skatisPrisma?: PrismaClient };

export const prisma =
  globalForPrisma.__skatisPrisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  });

if (!isProduction) {
  globalForPrisma.__skatisPrisma = prisma;
}
