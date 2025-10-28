-- ============================================================================
-- Script de Verificación Rápida - Fix Newsletter Stages
-- ============================================================================
-- Ejecutar después del deployment para verificar que todo está OK
-- Uso: psql "postgresql://bis_user:DomingaDos2@82.29.58.172:5432/bis_local" -f verify-stages-fix.sql
-- ============================================================================

\echo '============================================'
\echo 'VERIFICACIÓN FIX NEWSLETTER STAGES'
\echo '============================================'
\echo ''

-- 1. Verificar que existen campañas con stages recientes
\echo '1. Campañas con stages (últimos 7 días):'
\echo '----------------------------------------'
SELECT
  campaign_id,
  COUNT(*) as total_stages,
  MIN(subject) as subject,
  MIN(created_at) as created_at,
  SUM(sent_count) as total_enviado,
  CASE
    WHEN SUM(sent_count) > 0 THEN '✅ Enviado'
    ELSE '⏳ Pendiente'
  END as estado
FROM newsletter_queue
WHERE campaign_id IS NOT NULL
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY campaign_id
ORDER BY MIN(created_at) DESC
LIMIT 5;

\echo ''
\echo ''

-- 2. Verificar que recipients tienen Resend IDs (para stages completados)
\echo '2. Resend IDs guardados (últimos 7 días):'
\echo '-----------------------------------------'
SELECT
  nq.subject,
  nq.stage_number,
  nq.status,
  COUNT(*) as recipients,
  COUNT(*) FILTER (WHERE nqr.resend_email_id IS NOT NULL) as con_resend_id,
  ROUND(100.0 * COUNT(*) FILTER (WHERE nqr.resend_email_id IS NOT NULL) / COUNT(*), 2) as porcentaje,
  CASE
    WHEN nq.status = 'completed' AND COUNT(*) FILTER (WHERE nqr.resend_email_id IS NOT NULL) = COUNT(*) THEN '✅'
    WHEN nq.status = 'completed' AND COUNT(*) FILTER (WHERE nqr.resend_email_id IS NOT NULL) = 0 THEN '❌'
    ELSE '⏳'
  END as check
FROM newsletter_queue nq
JOIN newsletter_queue_recipients nqr ON nq.id = nqr.queue_id
WHERE nq.created_at > NOW() - INTERVAL '7 days'
  AND nq.campaign_id IS NOT NULL
GROUP BY nq.id, nq.subject, nq.stage_number, nq.status
ORDER BY nq.created_at DESC
LIMIT 10;

\echo ''
\echo ''

-- 3. CRÍTICO: Detectar duplicados (no debe haber ninguno)
\echo '3. Verificar NO duplicación de emails:'
\echo '--------------------------------------'
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✅ NO hay duplicados'
    ELSE '❌ HAY ' || COUNT(*) || ' DUPLICADOS!'
  END as resultado
FROM (
  SELECT
    nq.campaign_id,
    nqr.email,
    COUNT(*) as veces_enviado
  FROM newsletter_queue nq
  JOIN newsletter_queue_recipients nqr ON nq.id = nqr.queue_id
  WHERE nq.campaign_id IS NOT NULL
    AND nqr.status = 'sent'
    AND nq.created_at > NOW() - INTERVAL '7 days'
  GROUP BY nq.campaign_id, nqr.email
  HAVING COUNT(*) > 1
) duplicados;

\echo ''

-- Mostrar duplicados si existen
SELECT
  nq.campaign_id,
  nq.subject,
  nqr.email,
  COUNT(*) as veces_enviado,
  array_agg(DISTINCT nq.stage_number ORDER BY nq.stage_number) as stages
FROM newsletter_queue nq
JOIN newsletter_queue_recipients nqr ON nq.id = nqr.queue_id
WHERE nq.campaign_id IS NOT NULL
  AND nqr.status = 'sent'
  AND nq.created_at > NOW() - INTERVAL '7 days'
GROUP BY nq.campaign_id, nq.subject, nqr.email
HAVING COUNT(*) > 1
LIMIT 10;

\echo ''
\echo ''

-- 4. Estado del worker
\echo '4. Estado del Worker:'
\echo '---------------------'
SELECT
  instance_id,
  status,
  started_at,
  last_heartbeat_at,
  jobs_processed,
  jobs_failed,
  AGE(NOW(), last_heartbeat_at) as ultima_actividad,
  CASE
    WHEN status = 'running' AND AGE(NOW(), last_heartbeat_at) < INTERVAL '1 minute' THEN '✅ Activo'
    WHEN status = 'running' AND AGE(NOW(), last_heartbeat_at) > INTERVAL '5 minutes' THEN '⚠️ Sin heartbeat reciente'
    WHEN status = 'stopped' THEN '❌ Detenido'
    ELSE '⚠️ Estado desconocido'
  END as check
FROM worker_sessions
WHERE status = 'running'
ORDER BY started_at DESC
LIMIT 1;

\echo ''
\echo ''

-- 5. Resumen de envíos recientes
\echo '5. Resumen de envíos (últimas 24h):'
\echo '------------------------------------'
SELECT
  COUNT(DISTINCT nq.id) as total_jobs,
  COUNT(DISTINCT nq.campaign_id) FILTER (WHERE nq.campaign_id IS NOT NULL) as campaigns_staged,
  SUM(nq.sent_count) as emails_enviados,
  COUNT(DISTINCT nqr.email) as destinatarios_unicos,
  CASE
    WHEN SUM(nq.sent_count) = COUNT(DISTINCT nqr.email) THEN '✅ Sin duplicados'
    ELSE '⚠️ Verificar duplicados (' || (SUM(nq.sent_count) - COUNT(DISTINCT nqr.email)) || ' extras)'
  END as validacion
FROM newsletter_queue nq
LEFT JOIN newsletter_queue_recipients nqr ON nq.id = nqr.queue_id AND nqr.status = 'sent'
WHERE nq.created_at > NOW() - INTERVAL '24 hours'
  AND nq.status = 'completed';

\echo ''
\echo ''
\echo '============================================'
\echo 'FIN DE VERIFICACIÓN'
\echo '============================================'
\echo ''
\echo 'IMPORTANTE:'
\echo '- Si hay ❌ en alguna verificación, revisar FIX_NEWSLETTER_STAGES.md'
\echo '- Sección de Troubleshooting para diagnóstico'
\echo ''
