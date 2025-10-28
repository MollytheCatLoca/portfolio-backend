/**
 * Newsletter service types
 */

export interface QueueJob {
  id: string;
  subject: string;
  html_content: string;
  text_content: string | null;
  list_ids: string[];
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  scheduled_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface Contact {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  activo: boolean;
}

export interface EmailParams {
  to: string | string[];
  subject: string;
  htmlBody: string;
  textBody?: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface BatchEmailResult {
  successful: number;
  failed: number;
  errors: Array<{
    email: string;
    error: string;
  }>;
  emailIds?: Array<{
    email: string;
    resendId: string;
  }>;
}

export interface JobProgress {
  sent: number;
  total: number;
  failed: number;
}

export interface ProcessJobResult {
  success: boolean;
  jobId: string;
  sent: number;
  failed: number;
  total: number;
  error?: string;
}
