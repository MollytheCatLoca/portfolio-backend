import { Router, Request, Response } from 'express';
import { authenticateApiKey } from '../middleware/auth';
import { newsletterLimiter } from '../middleware/rate-limit';
import { sendSuccess, sendError, sendNotFound } from '../utils/response';
import {
  getNextJob,
  getJobById,
  processJob,
  getJobs,
  cancelJob,
} from '../services/newsletter/queue-processor';
import logger, { newsletterLogger } from '../utils/logger';

const router = Router();

// Apply authentication to all newsletter routes
router.use(authenticateApiKey);

/**
 * POST /api/newsletter/process-queue
 * Process next pending job in the queue (or specific job by ID)
 */
router.post('/process-queue', newsletterLimiter, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.body;

    let job;
    if (jobId) {
      // Process specific job
      job = await getJobById(jobId);
      if (!job) {
        return sendNotFound(res, 'Job');
      }
    } else {
      // Get next pending job
      job = await getNextJob();
      if (!job) {
        return sendSuccess(res, {
          message: 'No pending jobs in queue',
          processed: false,
        });
      }
    }

    // Process the job
    newsletterLogger.info('Starting job processing', { jobId: job.id });
    const result = await processJob(job);

    if (result.success) {
      return sendSuccess(res, {
        message: 'Job processed successfully',
        processed: true,
        jobId: result.jobId,
        sent: result.sent,
        failed: result.failed,
        total: result.total,
      });
    } else {
      return sendError(res, result.error || 'Job processing failed', 500, {
        jobId: result.jobId,
      });
    }
  } catch (error: any) {
    logger.error('Error in process-queue endpoint:', error);
    return sendError(res, error.message || 'Internal server error');
  }
});

/**
 * GET /api/newsletter/job/:id
 * Get status and details of a specific job
 */
router.get('/job/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const job = await getJobById(id);

    if (!job) {
      return sendNotFound(res, 'Job');
    }

    return sendSuccess(res, {
      job: {
        id: job.id,
        subject: job.subject,
        listIds: job.list_ids,
        status: job.status,
        totalRecipients: job.total_recipients,
        sentCount: job.sent_count,
        failedCount: job.failed_count,
        retryCount: job.retry_count,
        maxRetries: job.max_retries,
        errorMessage: job.error_message,
        scheduledAt: job.scheduled_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching job:', error);
    return sendError(res, error.message || 'Internal server error');
  }
});

/**
 * GET /api/newsletter/jobs
 * Get list of jobs (with optional status filter)
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const { status, limit } = req.query;

    const limitNum = limit ? parseInt(limit as string, 10) : 50;
    const jobs = await getJobs(status as string | undefined, limitNum);

    return sendSuccess(res, {
      jobs: jobs.map((job) => ({
        id: job.id,
        subject: job.subject,
        status: job.status,
        totalRecipients: job.total_recipients,
        sentCount: job.sent_count,
        failedCount: job.failed_count,
        retryCount: job.retry_count,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
      })),
      count: jobs.length,
    });
  } catch (error: any) {
    logger.error('Error fetching jobs:', error);
    return sendError(res, error.message || 'Internal server error');
  }
});

/**
 * POST /api/newsletter/cancel/:id
 * Cancel a pending job
 */
router.post('/cancel/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const cancelled = await cancelJob(id);

    if (!cancelled) {
      return sendNotFound(res, 'Job');
    }

    return sendSuccess(res, {
      message: 'Job cancelled successfully',
      jobId: id,
    });
  } catch (error: any) {
    logger.error('Error cancelling job:', error);
    return sendError(res, error.message || 'Internal server error', 400);
  }
});

/**
 * GET /api/newsletter/stats
 * Get queue statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const [pending, processing, completed, failed] = await Promise.all([
      getJobs('pending', 1000),
      getJobs('processing', 1000),
      getJobs('completed', 1000),
      getJobs('error', 1000),
    ]);

    const totalSent = completed.reduce((sum, job) => sum + job.sent_count, 0);
    const totalFailed = completed.reduce((sum, job) => sum + job.failed_count, 0);

    return sendSuccess(res, {
      queue: {
        pending: pending.length,
        processing: processing.length,
        completed: completed.length,
        failed: failed.length,
      },
      emails: {
        sent: totalSent,
        failed: totalFailed,
      },
    });
  } catch (error: any) {
    logger.error('Error fetching stats:', error);
    return sendError(res, error.message || 'Internal server error');
  }
});

export default router;
