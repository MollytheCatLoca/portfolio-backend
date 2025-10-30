import { Router, Request, Response } from 'express';
import { authenticateApiKey } from '../middleware/auth';
import { sendSuccess, sendError, sendNotFound } from '../utils/response';
import {
  getJobById,
  getJobs,
  createJob,
} from '../services/newsletter/queue-processor';
import logger from '../utils/logger';

const router = Router();

// Apply authentication to all admin routes
router.use(authenticateApiKey);

/**
 * GET /api/admin/mailing/newsletter/queue/active
 * Get all active jobs (pending or processing)
 */
router.get('/mailing/newsletter/queue/active', async (_req: Request, res: Response) => {
  try {
    const [pendingJobs, processingJobs] = await Promise.all([
      getJobs('pending', 100),
      getJobs('processing', 100),
    ]);

    const jobs = [...pendingJobs, ...processingJobs].map((job) => {
      const porcentaje = job.total_recipients > 0 
        ? Math.round((job.sent_count / job.total_recipients) * 100) 
        : 0;

      return {
        id: job.id,
        title: job.subject || 'Sin título',
        status: job.status,
        progress: {
          sent: job.sent_count,
          total: job.total_recipients,
          errors: job.failed_count,
          porcentaje,
          tasaExito: job.total_recipients > 0 
            ? Math.round(((job.sent_count - job.failed_count) / job.total_recipients) * 100) 
            : 0,
        },
        lists: (job.list_ids || []).map((id: string) => ({ id, name: id })),
        created_at: job.created_at,
        started_at: job.started_at,
        retry_count: job.retry_count,
        tiempo_estimado_segundos: null, // TODO: calcular basado en tasa de envío
      };
    });

    return sendSuccess(res, { jobs });
  } catch (error: any) {
    logger.error('Error fetching active jobs:', error);
    return sendError(res, error.message || 'Internal server error');
  }
});

/**
 * GET /api/admin/mailing/newsletter/history
 * Get completed sends history
 */
router.get('/mailing/newsletter/history', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '10'), 50);
    const offset = parseInt(req.query.offset as string || '0');

    const [completedJobs, errorJobs, cancelledJobs] = await Promise.all([
      getJobs('completed', 1000),
      getJobs('error', 1000),
      getJobs('cancelled', 1000),
    ]);

    const allJobs = [...completedJobs, ...errorJobs, ...cancelledJobs]
      .sort((a, b) => {
        const dateA = a.completed_at || a.updated_at;
        const dateB = b.completed_at || b.updated_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })
      .slice(offset, offset + limit);

    const sends = allJobs.map((job) => ({
      id: job.id,
      title: job.subject || 'Sin título',
      status: job.status,
      sent: job.sent_count,
      failed: job.failed_count,
      total: job.total_recipients,
      lists: job.list_ids || [],
      created_at: job.created_at,
      completed_at: job.completed_at,
      error_message: job.error_message,
    }));

    return sendSuccess(res, {
      sends,
      total: completedJobs.length + errorJobs.length + cancelledJobs.length,
      limit,
      offset,
    });
  } catch (error: any) {
    logger.error('Error fetching history:', error);
    return sendError(res, error.message || 'Internal server error');
  }
});

/**
 * POST /api/admin/mailing/newsletter/queue
 * Create new newsletter send job
 */
router.post('/mailing/newsletter/queue', async (req: Request, res: Response) => {
  try {
    const { edition, distributionListIds, scheduledAt } = req.body;

    if (!edition || !distributionListIds || !Array.isArray(distributionListIds)) {
      return sendError(res, 'Invalid request body', 400);
    }

    const job = await createJob({
      subject: edition.title,
      htmlContent: edition.htmlContent,
      textContent: edition.textContent,
      listIds: distributionListIds,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    });

    return sendSuccess(res, {
      jobId: job.id,
      status: job.status,
      message: 'Job created successfully',
    });
  } catch (error: any) {
    logger.error('Error creating job:', error);
    return sendError(res, error.message || 'Internal server error');
  }
});

/**
 * GET /api/admin/mailing/newsletter/status/:id
 * Get job status
 */
router.get('/mailing/newsletter/status/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const job = await getJobById(id);

    if (!job) {
      return sendNotFound(res, 'Job');
    }

    return sendSuccess(res, {
      id: job.id,
      status: job.status,
      sent_count: job.sent_count,
      failed_count: job.failed_count,
      total_recipients: job.total_recipients,
      error_message: job.error_message,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      retry_count: job.retry_count || 0,
    });
  } catch (error: any) {
    logger.error('Error fetching job status:', error);
    return sendError(res, error.message || 'Internal server error');
  }
});

export default router;
