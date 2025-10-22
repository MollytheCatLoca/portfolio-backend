-- ============================================================================
-- WORKER SESSION TRACKING TABLE
-- ============================================================================
--
-- Purpose: Track worker sessions to prevent duplicates and monitor status
--
-- Features:
-- - Unique instance_id prevents duplicate sessions
-- - Heartbeat tracking for stale session detection
-- - Job tracking to see what worker is currently processing
-- - Statistics counters for jobs processed/failed
--
-- Execution:
--   psql "postgresql://bis_user:DomingaDos2@82.29.58.172:5432/bis_local" -f scripts/create-worker-sessions-table.sql
--

-- Create worker_sessions table
CREATE TABLE IF NOT EXISTS worker_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id         VARCHAR(255) UNIQUE NOT NULL,  -- hostname-pid-timestamp
    hostname            VARCHAR(255) NOT NULL,
    pid                 INTEGER NOT NULL,
    status              VARCHAR(50) NOT NULL DEFAULT 'starting',  -- starting, running, stopping, stopped, crashed
    current_job_id      UUID,
    current_job_subject TEXT,
    started_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    last_heartbeat_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    stopped_at          TIMESTAMP,
    jobs_processed      INTEGER NOT NULL DEFAULT 0,
    jobs_failed         INTEGER NOT NULL DEFAULT 0,
    metadata            JSONB,  -- version, config, environment info, etc.
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_worker_sessions_status_heartbeat
    ON worker_sessions(status, last_heartbeat_at);

CREATE INDEX IF NOT EXISTS idx_worker_sessions_hostname
    ON worker_sessions(hostname);

CREATE INDEX IF NOT EXISTS idx_worker_sessions_current_job
    ON worker_sessions(current_job_id)
    WHERE current_job_id IS NOT NULL;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_worker_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_worker_sessions_updated_at ON worker_sessions;
CREATE TRIGGER trigger_worker_sessions_updated_at
    BEFORE UPDATE ON worker_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_worker_sessions_updated_at();

-- Verify table was created
SELECT
    'worker_sessions table created successfully' as status,
    COUNT(*) as existing_sessions
FROM worker_sessions;

-- Show table structure
\d worker_sessions
