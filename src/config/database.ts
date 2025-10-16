import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

// Singleton instance
let prisma: PrismaClient | null = null;

/**
 * Get Prisma client instance (singleton)
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });

    // Log warnings and errors
    prisma.$on('warn', (e) => {
      logger.warn('Prisma warning:', e);
    });

    prisma.$on('error', (e) => {
      logger.error('Prisma error:', e);
    });

    logger.info('✅ Prisma client initialized');
  }

  return prisma;
}

/**
 * Test database connection
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    logger.info('✅ Database connection successful');
    return true;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    return false;
  }
}

/**
 * Disconnect from database
 */
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    logger.info('✅ Disconnected from database');
  }
}

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

export default getPrismaClient;
