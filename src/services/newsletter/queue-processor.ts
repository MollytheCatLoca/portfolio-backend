import getPrismaClient from '../../config/database';
import env from '../../config/env';
import { QueueJob, ProcessJobResult, EmailParams } from './types';
import { getContactsFromLists, validateContacts } from './contact-resolver';
import { sendBatchEmails } from './batch-sender';
import logger, { newsletterLogger } from '../../utils/logger';

/**
 * Get next pending job from queue
 */
export async function getNextJob(): Promise<QueueJob | null> {
  try {
    const prisma = getPrismaClient();

    const jobs = await prisma.newsletter_queue.findMany({
      where: {
        status: 'pending',
        retry_count: { lt: env.MAX_RETRIES },
      },
      orderBy: {
        created_at: 'asc',
      },
      take: 1,
    });

    return jobs.length > 0 ? (jobs[0] as any as QueueJob) : null;
  } catch (error) {
    logger.error('Error fetching next job:', error);
    return null;
  }
}

/**
 * Get specific job by ID
 */
export async function getJobById(jobId: string): Promise<QueueJob | null> {
  try {
    const prisma = getPrismaClient();

    const job = await prisma.newsletter_queue.findUnique({
      where: { id: jobId },
    });

    return job as any as QueueJob | null;
  } catch (error) {
    logger.error('Error fetching job by ID:', error);
    return null;
  }
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  jobId: string,
  status: string,
  sentCount: number,
  failedCount: number,
  totalRecipients?: number,
  errorMessage?: string
): Promise<void> {
  try {
    const prisma = getPrismaClient();

    const updateData: any = {
      status,
      sent_count: sentCount,
      failed_count: failedCount,
    };

    if (totalRecipients !== undefined) {
      updateData.total_recipients = totalRecipients;
    }

    if (status === 'processing' && sentCount === 0) {
      updateData.started_at = new Date();
    }

    if (status === 'completed' || status === 'error' || status === 'cancelled') {
      updateData.completed_at = new Date();
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    await prisma.newsletter_queue.update({
      where: { id: jobId },
      data: updateData,
    });

    newsletterLogger.info('Job progress updated', {
      jobId,
      status,
      sentCount,
      failedCount,
    });
  } catch (error) {
    logger.error('Error updating job progress:', error);
    throw error;
  }
}

/**
 * Increment retry count
 */
export async function incrementRetryCount(jobId: string): Promise<void> {
  try {
    const prisma = getPrismaClient();

    await prisma.newsletter_queue.update({
      where: { id: jobId },
      data: {
        retry_count: { increment: 1 },
      },
    });
  } catch (error) {
    logger.error('Error incrementing retry count:', error);
    throw error;
  }
}

/**
 * Process a newsletter job
 */
export async function processJob(job: QueueJob): Promise<ProcessJobResult> {
  newsletterLogger.info(`Processing job ${job.id}`, {
    jobId: job.id,
    listIds: job.list_ids,
  });

  try {
    // Mark as processing
    await updateJobProgress(job.id, 'processing', 0, 0);

    // Get contacts from distribution lists
    newsletterLogger.info('Fetching contacts...');
    const contacts = await getContactsFromLists(job.list_ids);

    if (contacts.length === 0) {
      throw new Error('No active contacts found in selected distribution lists');
    }

    // Validate contacts
    const validContacts = validateContacts(contacts);

    if (validContacts.length === 0) {
      throw new Error('No valid email addresses found in selected contacts');
    }

    newsletterLogger.info(`Found ${validContacts.length} valid contacts`);

    // Update total recipients
    await updateJobProgress(job.id, 'processing', 0, 0, validContacts.length);

    // Prepare emails for sending
    const emailsToSend: EmailParams[] = validContacts.map((contact) => ({
      to: contact.email,
      subject: job.subject,
      htmlBody: job.html_content,
      textBody: job.text_content || undefined,
      from: process.env.RESEND_FROM_EMAIL || 'mensajes@bisintegraciones.com',
    }));

    newsletterLogger.info(`Sending ${emailsToSend.length} emails via Resend...`);

    // Send emails in batches
    const result = await sendBatchEmails(emailsToSend);

    // Update final progress
    await updateJobProgress(
      job.id,
      'completed',
      result.successful,
      result.failed,
      validContacts.length
    );

    newsletterLogger.info('Job completed', {
      jobId: job.id,
      successful: result.successful,
      failed: result.failed,
    });

    if (result.errors.length > 0) {
      newsletterLogger.warn('Errors found during sending:', {
        count: result.errors.length,
        samples: result.errors.slice(0, 5),
      });
    }

    return {
      success: true,
      jobId: job.id,
      sent: result.successful,
      failed: result.failed,
      total: validContacts.length,
    };
  } catch (error: any) {
    logger.error(`Error processing job ${job.id}:`, error);

    // Increment retry count
    await incrementRetryCount(job.id);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Get updated job to check retry count
    const updatedJob = await getJobById(job.id);
    const retryCount = updatedJob?.retry_count || job.retry_count;

    // If max retries reached, mark as error
    if (retryCount >= env.MAX_RETRIES) {
      await updateJobProgress(job.id, 'error', 0, 0, undefined, errorMessage);
      newsletterLogger.error('Job marked as error (max retries reached)', {
        jobId: job.id,
        retryCount,
      });
    } else {
      // Reset to pending for retry
      await updateJobProgress(job.id, 'pending', 0, 0, undefined, errorMessage);
      newsletterLogger.info('Job will retry', {
        jobId: job.id,
        attempt: retryCount + 1,
        maxRetries: env.MAX_RETRIES,
      });
    }

    return {
      success: false,
      jobId: job.id,
      sent: 0,
      failed: 0,
      total: 0,
      error: errorMessage,
    };
  }
}

/**
 * Get all jobs (with optional filters)
 */
export async function getJobs(
  status?: string,
  limit: number = 50
): Promise<QueueJob[]> {
  try {
    const prisma = getPrismaClient();

    const where = status ? { status } : undefined;

    const jobs = await prisma.newsletter_queue.findMany({
      where,
      orderBy: {
        created_at: 'desc',
      },
      take: limit,
    });

    return jobs as any as QueueJob[];
  } catch (error) {
    logger.error('Error fetching jobs:', error);
    return [];
  }
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  try {
    const job = await getJobById(jobId);

    if (!job) {
      return false;
    }

    if (job.status !== 'pending') {
      throw new Error('Can only cancel pending jobs');
    }

    await updateJobProgress(jobId, 'cancelled', 0, 0);

    newsletterLogger.info('Job cancelled', { jobId });

    return true;
  } catch (error) {
    logger.error('Error cancelling job:', error);
    throw error;
  }
}

/**
 * Create a new newsletter job
 */
export async function createJob(params: {
  subject: string;
  htmlContent: string;
  textContent?: string;
  listIds: string[];
  scheduledAt?: Date;
  createdBy?: number;
}): Promise<QueueJob> {
  try {
    const prisma = getPrismaClient();

    const job = await prisma.newsletter_queue.create({
      data: {
        subject: params.subject,
        html_content: params.htmlContent,
        text_content: params.textContent || null,
        list_ids: params.listIds,
        status: 'pending',
        total_recipients: 0,
        sent_count: 0,
        failed_count: 0,
        retry_count: 0,
        max_retries: env.MAX_RETRIES,
        scheduled_at: params.scheduledAt || null,
        created_by: params.createdBy || null,
      },
    });

    newsletterLogger.info('Job created', {
      jobId: job.id,
      subject: job.subject,
      listIds: params.listIds,
    });

    return job as any as QueueJob;
  } catch (error) {
    logger.error('Error creating job:', error);
    throw error;
  }
}
