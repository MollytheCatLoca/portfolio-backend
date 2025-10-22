import os from 'os';
import getPrismaClient from '../../config/database';
import logger, { newsletterLogger } from '../../utils/logger';

// Session state
let currentSessionId: string | null = null;

/**
 * Generate unique instance ID
 * Format: hostname-pid-timestamp
 */
function generateInstanceId(): string {
  const hostname = os.hostname();
  const pid = process.pid;
  const timestamp = Date.now();
  return `${hostname}-${pid}-${timestamp}`;
}

/**
 * Get metadata about current environment
 */
function getMetadata(): object {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    environment: process.env.NODE_ENV || 'development',
    pollInterval: process.env.WORKER_POLL_INTERVAL || '10000',
  };
}

/**
 * Check for active sessions
 * Returns array of active sessions (status = 'starting' or 'running')
 */
export async function checkForActiveSessions(): Promise<any[]> {
  try {
    const prisma = getPrismaClient();

    const activeSessions = await prisma.worker_sessions.findMany({
      where: {
        status: {
          in: ['starting', 'running']
        }
      },
      orderBy: {
        started_at: 'desc'
      }
    });

    return activeSessions;
  } catch (error) {
    logger.error('Error checking for active sessions:', error);
    throw error;
  }
}

/**
 * Detect and mark stale sessions as crashed
 * A session is stale if last_heartbeat_at is older than 2 minutes
 */
export async function detectStaleSessions(): Promise<number> {
  try {
    const prisma = getPrismaClient();

    // Calculate stale threshold (2 minutes ago)
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000);

    const result = await prisma.worker_sessions.updateMany({
      where: {
        status: {
          in: ['starting', 'running']
        },
        last_heartbeat_at: {
          lt: staleThreshold
        }
      },
      data: {
        status: 'crashed',
        stopped_at: new Date()
      }
    });

    if (result.count > 0) {
      logger.warn(`⚠️  Marked ${result.count} stale session(s) as crashed`);
    }

    return result.count;
  } catch (error) {
    logger.error('Error detecting stale sessions:', error);
    return 0;
  }
}

/**
 * Start a new worker session
 *
 * IMPORTANT:
 * - Checks for existing active sessions first
 * - Detects and marks stale sessions as crashed
 * - Throws error if another active session exists
 * - Creates new session record with status='starting'
 */
export async function startSession(): Promise<string> {
  try {
    const prisma = getPrismaClient();

    // First, detect and clean up stale sessions
    await detectStaleSessions();

    // Check for active sessions
    const activeSessions = await checkForActiveSessions();

    if (activeSessions.length > 0) {
      const session = activeSessions[0];
      const errorMsg = `❌ DUPLICATE WORKER DETECTED!\n` +
        `Another worker session is already running:\n` +
        `  ID: ${session.id}\n` +
        `  Instance: ${session.instance_id}\n` +
        `  Hostname: ${session.hostname}\n` +
        `  PID: ${session.pid}\n` +
        `  Status: ${session.status}\n` +
        `  Started: ${session.started_at}\n` +
        `  Last Heartbeat: ${session.last_heartbeat_at}\n` +
        `\nPlease stop the existing worker before starting a new one.`;

      logger.error(errorMsg);
      throw new Error('Another worker session is already running');
    }

    // Create new session
    const instanceId = generateInstanceId();
    const metadata = getMetadata();

    const session = await prisma.worker_sessions.create({
      data: {
        instance_id: instanceId,
        hostname: os.hostname(),
        pid: process.pid,
        status: 'starting',
        metadata: metadata as any,
      }
    });

    currentSessionId = session.id;

    newsletterLogger.info('✅ Worker session started', {
      sessionId: session.id,
      instanceId: session.instance_id,
      hostname: session.hostname,
      pid: session.pid,
    });

    return session.id;
  } catch (error) {
    logger.error('Error starting session:', error);
    throw error;
  }
}

/**
 * Update session status to 'running'
 */
export async function markSessionRunning(): Promise<void> {
  if (!currentSessionId) {
    logger.warn('No current session ID to mark as running');
    return;
  }

  try {
    const prisma = getPrismaClient();

    await prisma.worker_sessions.update({
      where: { id: currentSessionId },
      data: {
        status: 'running',
        last_heartbeat_at: new Date()
      }
    });

    newsletterLogger.info('🏃 Worker session marked as running', {
      sessionId: currentSessionId
    });
  } catch (error) {
    logger.error('Error marking session as running:', error);
  }
}

/**
 * Update heartbeat timestamp
 * Should be called in every poll cycle (every 10 seconds)
 */
export async function updateHeartbeat(): Promise<void> {
  if (!currentSessionId) {
    return;
  }

  try {
    const prisma = getPrismaClient();

    await prisma.worker_sessions.update({
      where: { id: currentSessionId },
      data: {
        last_heartbeat_at: new Date()
      }
    });
  } catch (error) {
    logger.error('Error updating heartbeat:', error);
  }
}

/**
 * Set current job being processed
 */
export async function setCurrentJob(jobId: string, subject: string): Promise<void> {
  if (!currentSessionId) {
    return;
  }

  try {
    const prisma = getPrismaClient();

    await prisma.worker_sessions.update({
      where: { id: currentSessionId },
      data: {
        current_job_id: jobId,
        current_job_subject: subject,
        last_heartbeat_at: new Date()
      }
    });

    newsletterLogger.info('📝 Current job set', {
      sessionId: currentSessionId,
      jobId,
      subject
    });
  } catch (error) {
    logger.error('Error setting current job:', error);
  }
}

/**
 * Clear current job when done processing
 */
export async function clearCurrentJob(): Promise<void> {
  if (!currentSessionId) {
    return;
  }

  try {
    const prisma = getPrismaClient();

    await prisma.worker_sessions.update({
      where: { id: currentSessionId },
      data: {
        current_job_id: null,
        current_job_subject: null,
        last_heartbeat_at: new Date()
      }
    });
  } catch (error) {
    logger.error('Error clearing current job:', error);
  }
}

/**
 * Increment job counter
 * @param success - true if job succeeded, false if failed
 */
export async function incrementJobCounter(success: boolean): Promise<void> {
  if (!currentSessionId) {
    return;
  }

  try {
    const prisma = getPrismaClient();

    await prisma.worker_sessions.update({
      where: { id: currentSessionId },
      data: success ? {
        jobs_processed: { increment: 1 },
        last_heartbeat_at: new Date()
      } : {
        jobs_failed: { increment: 1 },
        last_heartbeat_at: new Date()
      }
    });
  } catch (error) {
    logger.error('Error incrementing job counter:', error);
  }
}

/**
 * Stop worker session
 * Marks session as stopped and sets stopped_at timestamp
 */
export async function stopSession(): Promise<void> {
  if (!currentSessionId) {
    logger.warn('No current session ID to stop');
    return;
  }

  try {
    const prisma = getPrismaClient();

    await prisma.worker_sessions.update({
      where: { id: currentSessionId },
      data: {
        status: 'stopped',
        stopped_at: new Date(),
        current_job_id: null,
        current_job_subject: null
      }
    });

    newsletterLogger.info('✅ Worker session stopped', {
      sessionId: currentSessionId
    });

    currentSessionId = null;
  } catch (error) {
    logger.error('Error stopping session:', error);
  }
}

/**
 * Mark session as stopping (before graceful shutdown)
 */
export async function markSessionStopping(): Promise<void> {
  if (!currentSessionId) {
    return;
  }

  try {
    const prisma = getPrismaClient();

    await prisma.worker_sessions.update({
      where: { id: currentSessionId },
      data: {
        status: 'stopping',
        last_heartbeat_at: new Date()
      }
    });

    newsletterLogger.info('⏸️  Worker session marked as stopping', {
      sessionId: currentSessionId
    });
  } catch (error) {
    logger.error('Error marking session as stopping:', error);
  }
}

/**
 * Get current session statistics
 */
export async function getSessionStats(): Promise<any> {
  if (!currentSessionId) {
    return null;
  }

  try {
    const prisma = getPrismaClient();

    const session = await prisma.worker_sessions.findUnique({
      where: { id: currentSessionId }
    });

    return session;
  } catch (error) {
    logger.error('Error getting session stats:', error);
    return null;
  }
}
