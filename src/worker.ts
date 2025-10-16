/**
 * Newsletter Queue Worker
 *
 * Background worker that processes newsletter sending jobs from the queue.
 * - Polls for pending jobs every 10 seconds
 * - Processes jobs sequentially
 * - Handles graceful shutdown
 * - Logs all activities
 */

import env from './config/env';
import { testDatabaseConnection, disconnectDatabase } from './config/database';
import { getNextJob, processJob } from './services/newsletter/queue-processor';
import logger, { newsletterLogger } from './utils/logger';

// Worker configuration
const POLL_INTERVAL = env.WORKER_POLL_INTERVAL || 10000; // 10 seconds
const MAX_RETRIES = env.MAX_RETRIES || 3;

// Worker state
let isRunning = true;
let isProcessing = false;
let pollIntervalId: NodeJS.Timeout | null = null;

/**
 * Main worker loop
 */
async function pollQueue(): Promise<void> {
  // Skip if already processing
  if (isProcessing) {
    return;
  }

  try {
    isProcessing = true;

    // Get next pending job
    const job = await getNextJob();

    if (!job) {
      logger.debug('No pending jobs in queue');
      return;
    }

    newsletterLogger.info(`🚀 Found pending job`, {
      jobId: job.id,
      subject: job.subject,
      listCount: job.list_ids.length,
      retryCount: job.retry_count,
    });

    // Process the job
    const result = await processJob(job);

    if (result.success) {
      newsletterLogger.info(`✅ Job completed successfully`, {
        jobId: result.jobId,
        sent: result.sent,
        failed: result.failed,
        total: result.total,
      });
    } else {
      newsletterLogger.error(`❌ Job processing failed`, {
        jobId: result.jobId,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error('Error in worker poll cycle:', error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the worker
 */
async function startWorker(): Promise<void> {
  try {
    logger.info('╔══════════════════════════════════════════════════════╗');
    logger.info('║     Newsletter Queue Worker - STARTING              ║');
    logger.info('╚══════════════════════════════════════════════════════╝');
    logger.info('');

    // Test database connection
    logger.info('🔍 Testing database connection...');
    await testDatabaseConnection();

    // Display configuration
    logger.info('📍 Environment: ' + env.NODE_ENV);
    logger.info(`🗄️  Database: ${env.DATABASE_URL?.split('@')[1]?.split('?')[0] || 'configured'}`);
    logger.info(`⏱️  Polling interval: ${POLL_INTERVAL}ms`);
    logger.info(`🔄 Max retries: ${MAX_RETRIES}`);
    logger.info('');

    logger.info('✅ Configuration verified');
    logger.info('🚀 Worker started - Press Ctrl+C to stop');
    logger.info('');

    // Start polling
    pollIntervalId = setInterval(pollQueue, POLL_INTERVAL);

    // Initial poll
    pollQueue();
  } catch (error) {
    logger.error('❌ Failed to start worker:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function gracefulShutdown(signal: string): Promise<void> {
  if (!isRunning) {
    return;
  }

  isRunning = false;

  logger.info('');
  logger.info(`${signal} received. Starting graceful shutdown...`);

  // Stop accepting new jobs
  if (pollIntervalId) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
    logger.info('✅ Stopped polling queue');
  }

  // Wait for current job to finish (max 60 seconds)
  if (isProcessing) {
    logger.info('⏳ Waiting for current job to finish...');
    const startTime = Date.now();
    const maxWaitTime = 60000; // 60 seconds

    while (isProcessing && Date.now() - startTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (isProcessing) {
      logger.warn('⚠️  Job still processing after 60s, forcing shutdown');
    } else {
      logger.info('✅ Current job completed');
    }
  }

  // Disconnect database
  await disconnectDatabase();

  logger.info('✅ Graceful shutdown completed');
  logger.info('');

  process.exit(0);
}

/**
 * Setup signal handlers
 */
function setupSignalHandlers(): void {
  // Graceful shutdown on SIGTERM (PM2, Docker, etc)
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Graceful shutdown on SIGINT (Ctrl+C)
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  setupSignalHandlers();
  await startWorker();
}

// Start worker if not in test mode
if (process.env.NODE_ENV !== 'test') {
  main();
}

export { startWorker, gracefulShutdown };
