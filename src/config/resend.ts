import { Resend } from 'resend';
import env from './env';
import logger from '../utils/logger';

// Singleton instance
let resendClient: Resend | null = null;

/**
 * Get Resend client instance (singleton)
 */
export function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(env.RESEND_API_KEY);
    logger.info('✅ Resend client initialized');
  }

  return resendClient;
}

/**
 * Test Resend API connection
 */
export async function testResendConnection(): Promise<boolean> {
  try {
    const client = getResendClient();
    // Test by checking API key validity (domains endpoint requires minimal permissions)
    await client.domains.list();
    logger.info('✅ Resend API connection successful');
    return true;
  } catch (error) {
    logger.error('❌ Resend API connection failed:', error);
    return false;
  }
}

export default getResendClient;
