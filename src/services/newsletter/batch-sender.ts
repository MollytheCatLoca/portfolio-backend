import getResendClient from '../../config/resend';
import env from '../../config/env';
import { EmailParams, BatchEmailResult } from './types';
import logger, { newsletterLogger } from '../../utils/logger';

/**
 * Send a single email via Resend
 */
export async function sendSingleEmail(params: EmailParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  try {
    const client = getResendClient();

    const { data, error } = await client.emails.send({
      from: params.from || process.env.RESEND_FROM_EMAIL || 'noreply@example.com',
      to: params.to,
      subject: params.subject,
      html: params.htmlBody,
      text: params.textBody,
      cc: params.cc,
      bcc: params.bcc,
      replyTo: params.replyTo,
      tags: params.tags,
    });

    if (error) {
      logger.error('Error sending email via Resend:', error);
      return {
        success: false,
        error: error.message || 'Unknown error sending email',
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error: any) {
    logger.error('Unexpected error sending email via Resend:', error);
    return {
      success: false,
      error: error.message || 'Unknown error sending email',
    };
  }
}

/**
 * Send multiple emails in batches via Resend
 *
 * Resend allows up to 100 emails per batch request.
 * This function automatically divides large batches into chunks of 100.
 */
export async function sendBatchEmails(
  emails: EmailParams[],
  batchSize: number = env.MAX_BATCH_SIZE
): Promise<BatchEmailResult> {
  const results: BatchEmailResult = {
    successful: 0,
    failed: 0,
    errors: [],
  };

  newsletterLogger.info(`Starting batch email send: ${emails.length} emails`);

  // Divide emails into chunks of batchSize
  const chunks: EmailParams[][] = [];
  for (let i = 0; i < emails.length; i += batchSize) {
    chunks.push(emails.slice(i, i + batchSize));
  }

  newsletterLogger.info(`Processing ${chunks.length} batches of up to ${batchSize} emails`);

  // Process each chunk
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];

    try {
      // Prepare batch for Resend
      const batchEmails = chunk.map((email) => ({
        from: email.from || process.env.RESEND_FROM_EMAIL || 'noreply@example.com',
        to: email.to,
        subject: email.subject,
        html: email.htmlBody,
        text: email.textBody,
        cc: email.cc,
        bcc: email.bcc,
        replyTo: email.replyTo,
        tags: email.tags,
      }));

      // Send complete batch
      const client = getResendClient();
      const { data, error } = await client.batch.send(batchEmails);

      if (error) {
        // If entire batch fails, mark all as failed
        newsletterLogger.error(`Error in batch ${chunkIndex + 1}:`, error);
        results.failed += chunk.length;
        chunk.forEach((email) => {
          results.errors.push({
            email: Array.isArray(email.to) ? email.to[0] : email.to,
            error: error.message || 'Batch error',
          });
        });
      } else {
        // Batch successful
        results.successful += chunk.length;

        // ✅ Track successful sends with Resend IDs for webhook tracking
        if (!results.emailIds) {
          results.emailIds = [];
        }

        if (data && Array.isArray(data)) {
          data.forEach((item, index) => {
            if (item.id && chunk[index]) {
              const emailTo = chunk[index].to;
              results.emailIds!.push({
                email: Array.isArray(emailTo) ? emailTo[0] : emailTo,
                resendId: item.id,
              });
            }
          });
        }

        // Log every 100 emails
        if ((chunkIndex + 1) * batchSize % 100 === 0 || chunkIndex === chunks.length - 1) {
          newsletterLogger.info(
            `Progress: ${Math.min((chunkIndex + 1) * batchSize, emails.length)}/${emails.length} emails sent`
          );
        }
      }
    } catch (error: any) {
      newsletterLogger.error(`Unexpected error in batch ${chunkIndex + 1}:`, error);
      results.failed += chunk.length;
      chunk.forEach((email) => {
        results.errors.push({
          email: Array.isArray(email.to) ? email.to[0] : email.to,
          error: error.message || 'Unexpected error',
        });
      });
    }

    // Small delay between batches to avoid rate limiting
    if (chunkIndex < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  newsletterLogger.info(
    `Batch send completed: ${results.successful} successful, ${results.failed} failed`
  );

  return results;
}

/**
 * Check if Resend is configured properly
 */
export function isResendConfigured(): boolean {
  return !!(env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}
