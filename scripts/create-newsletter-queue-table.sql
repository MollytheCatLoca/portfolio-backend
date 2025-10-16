-- SQL Script to create newsletter_queue table
-- Run this on the VPS database before deploying the backend

-- Check if table exists and drop if needed (CAREFUL IN PRODUCTION)
-- DROP TABLE IF EXISTS newsletter_queue;

CREATE TABLE IF NOT EXISTS newsletter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject VARCHAR(500) NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  list_ids UUID[] NOT NULL DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_newsletter_queue_status ON newsletter_queue(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_queue_created_at ON newsletter_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_newsletter_queue_retry_count ON newsletter_queue(retry_count);

-- Add comments
COMMENT ON TABLE newsletter_queue IS 'Queue for newsletter emails to be processed by portfolio-backend';
COMMENT ON COLUMN newsletter_queue.subject IS 'Email subject line';
COMMENT ON COLUMN newsletter_queue.html_content IS 'HTML version of email';
COMMENT ON COLUMN newsletter_queue.text_content IS 'Plain text version of email';
COMMENT ON COLUMN newsletter_queue.list_ids IS 'Array of distribution list UUIDs';
COMMENT ON COLUMN newsletter_queue.status IS 'Job status: pending, processing, completed, error, cancelled';
COMMENT ON COLUMN newsletter_queue.total_recipients IS 'Total number of recipients';
COMMENT ON COLUMN newsletter_queue.sent_count IS 'Number of emails sent successfully';
COMMENT ON COLUMN newsletter_queue.failed_count IS 'Number of failed email sends';
COMMENT ON COLUMN newsletter_queue.retry_count IS 'Current retry attempt number';
COMMENT ON COLUMN newsletter_queue.max_retries IS 'Maximum number of retry attempts';

-- Grant permissions (adjust user as needed)
GRANT SELECT, INSERT, UPDATE ON newsletter_queue TO bis_user;

SELECT 'newsletter_queue table created successfully!' AS message;
