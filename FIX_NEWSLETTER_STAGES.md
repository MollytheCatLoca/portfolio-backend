# Fix Newsletter Stages - Documentación Completa

**Fecha**: 28 octubre 2025
**Severidad**: 🚨 CRÍTICA
**Estado**: ✅ IMPLEMENTADO - PENDIENTE DEPLOYMENT Y TESTING

---

## 📋 Índice

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Problema Identificado](#problema-identificado)
3. [Solución Implementada](#solución-implementada)
4. [Deployment al VPS](#deployment-al-vps)
5. [Plan de Testing](#plan-de-testing)
6. [Verificación Post-Deployment](#verificación-post-deployment)
7. [Troubleshooting](#troubleshooting)
8. [Rollback Plan](#rollback-plan)

---

## 🎯 Resumen Ejecutivo

### El Bug
El worker backend **ignoraba completamente** los recipients pre-guardados en `newsletter_queue_recipients` y siempre leía contactos desde las listas completas (`list_ids`), causando que **cada stage enviara a TODA la lista** en lugar de solo a su subset específico.

### Impacto Real (28 Oct 2025)
- **Campaña afectada**: Newsletter BIS - 28 octubre '25
- **Stages creados**: 3 (Stage 1: 1,500 | Stage 2: 1,500 | Stage 3: 1,442)
- **Stage 1**: ✅ Ejecutado - envió a 4,338 contactos (TODA la lista)
- **Stages 2-3**: ❌ Cancelados URGENTEMENTE
- **Duplicados evitados**: ~8,600 emails

### La Solución
Modificar el worker backend para:
1. **Leer recipients pre-guardados** de `newsletter_queue_recipients` PRIMERO
2. **Fallback inteligente** a `list_ids` si no hay recipients (envíos legacy)
3. **Guardar Resend IDs** en la BD para tracking de webhooks

---

## 🐛 Problema Identificado

### Arquitectura del Sistema

**Frontend (Next.js)** - `/app/api/admin/mailing/newsletter/send-staged/route.ts`:
```typescript
// ✅ CORRECTO: Divide contactos y guarda en newsletter_queue_recipients
for (let i = 0; i < totalStages; i++) {
  const stageContacts = contactosUnicos.slice(start, end);

  // Guarda recipients específicos para cada stage
  await prisma.$executeRaw`
    INSERT INTO newsletter_queue_recipients (
      queue_id, email, contact_id, status
    ) VALUES (...)
  `;
}
```

**Backend Worker (VPS)** - `/src/services/newsletter/queue-processor.ts:165`:
```typescript
// ❌ INCORRECTO: Ignora recipients guardados
const contacts = await getContactsFromLists(job.list_ids);
// Resultado: Lee TODA la lista en cada stage
```

### Evidencia del Bug

**Base de datos (28 Oct 2025)**:
```sql
-- Recipients guardados correctamente por el frontend
SELECT stage_number, COUNT(*) as recipients_guardados
FROM newsletter_queue nq
JOIN newsletter_queue_recipients nqr ON nq.id = nqr.queue_id
WHERE campaign_id = 'dc33fd9c-faad-4264-a1f7-5ca92c74abc4'
GROUP BY stage_number;

/*
stage_number | recipients_guardados
-------------+---------------------
     1       |        1500
     2       |        1500
     3       |        1442
*/

-- Pero el Stage 1 envió a TODA la lista
SELECT total_recipients, sent_count
FROM newsletter_queue
WHERE campaign_id = 'dc33fd9c-faad-4264-a1f7-5ca92c74abc4'
  AND stage_number = 1;

/*
total_recipients | sent_count
-----------------+-----------
     4438        |    4338

❌ Envió a 4,338 en lugar de 1,500
*/
```

**Conclusión**: El worker ignoró los 1,500 recipients guardados y leyó los 4,438 de la lista completa.

---

## ✅ Solución Implementada

### Archivos Modificados

#### 1. `/src/services/newsletter/types.ts`

**Cambio**: Agregar campo `emailIds` a `BatchEmailResult`

```typescript
export interface BatchEmailResult {
  successful: number;
  failed: number;
  errors: Array<{
    email: string;
    error: string;
  }>;
  // ✅ NUEVO
  emailIds?: Array<{
    email: string;
    resendId: string;
  }>;
}
```

**Propósito**: Capturar Resend IDs para guardarlos en la BD.

---

#### 2. `/src/services/newsletter/contact-resolver.ts`

**Cambio**: Nueva función `getRecipientsForJob()`

```typescript
/**
 * Get recipients pre-saved for a staged job
 * Returns null if no recipients are saved (legacy behavior - use list_ids instead)
 */
export async function getRecipientsForJob(jobId: string): Promise<Contact[] | null> {
  try {
    const prisma = getPrismaClient();

    // Check if job has pre-saved recipients (staged campaigns)
    const recipients = await prisma.$queryRaw<Contact[]>`
      SELECT
        cc.id,
        cc.nombre,
        cc.apellido,
        cc.email,
        cc.activo
      FROM newsletter_queue_recipients nqr
      JOIN client_contacts cc ON nqr.contact_id = cc.id
      WHERE nqr.queue_id = ${jobId}::uuid
        AND cc.activo = true
    `;

    if (recipients.length === 0) {
      newsletterLogger.info('No pre-saved recipients found, will use list_ids fallback');
      return null;
    }

    newsletterLogger.info(`Found ${recipients.length} pre-saved recipients for staged job`);
    return recipients;
  } catch (error) {
    logger.error('Error fetching recipients for job:', error);
    return null; // Fallback to list_ids on error
  }
}
```

**Propósito**:
- Leer recipients pre-guardados de `newsletter_queue_recipients`
- Retornar `null` si no hay recipients → fallback a `list_ids`
- Solo retornar contactos activos

---

#### 3. `/src/services/newsletter/batch-sender.ts`

**Cambio**: Capturar y retornar Resend IDs

```typescript
// Línea 96: Cambiar destructuring para capturar data
const { data, error } = await client.batch.send(batchEmails);

if (error) {
  // ... manejo de error
} else {
  // Batch successful
  results.successful += chunk.length;

  // ✅ NUEVO: Track successful sends with Resend IDs
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
}
```

**Propósito**:
- Capturar `data` del response de Resend
- Mapear cada email enviado a su Resend ID
- Retornar en `result.emailIds`

---

#### 4. `/src/services/newsletter/queue-processor.ts`

**Cambio 1**: Agregar import

```typescript
// Línea 4
import { getContactsFromLists, validateContacts, getRecipientsForJob } from './contact-resolver';
```

**Cambio 2**: Usar recipients pre-guardados (línea 163-171)

```typescript
// Get contacts: Try pre-saved recipients first (staged campaigns), fallback to list_ids
newsletterLogger.info('Fetching contacts...');
let contacts = await getRecipientsForJob(job.id);

// Fallback to list_ids if no pre-saved recipients (legacy/normal sends)
if (!contacts) {
  newsletterLogger.info('Using distribution lists (no pre-saved recipients found)');
  contacts = await getContactsFromLists(job.list_ids);
}
```

**Cambio 3**: Guardar Resend IDs (después de línea 201)

```typescript
// Send emails in batches
const result = await sendBatchEmails(emailsToSend);

// ✅ NUEVO: Save Resend email IDs for webhook tracking
// This is critical for staged campaigns where recipients were pre-saved
if (result.emailIds && result.emailIds.length > 0) {
  const prisma = getPrismaClient();
  try {
    for (const { email, resendId } of result.emailIds) {
      await prisma.$executeRaw`
        UPDATE newsletter_queue_recipients
        SET
          resend_email_id = ${resendId},
          status = 'sent',
          sent_at = NOW(),
          updated_at = NOW()
        WHERE queue_id = ${job.id}::uuid
          AND email = ${email}
      `;
    }
    newsletterLogger.info(`Updated ${result.emailIds.length} Resend IDs in tracking table`);
  } catch (error) {
    logger.warn('Error updating Resend IDs (non-critical):', error);
  }
}
```

**Propósito**:
- Intentar leer recipients pre-guardados primero
- Fallback a list_ids si no hay recipients
- Guardar Resend IDs en `newsletter_queue_recipients` para tracking

---

### Backward Compatibility

El sistema ahora soporta **AMBOS flujos**:

**1. Envíos con Stages** (con `campaign_id`):
```
Frontend guarda recipients → Worker lee recipients → Envía solo a esos → Guarda Resend IDs
```

**2. Envíos Normales** (sin `campaign_id` - legacy):
```
Worker no encuentra recipients → Fallback a list_ids → Envía → Funciona igual que antes
```

✅ Sin breaking changes para envíos normales.

---

## 🚀 Deployment al VPS

### Pre-requisitos
- Acceso SSH al VPS: `root@82.29.58.172`
- PM2 instalado (para restart del worker)
- Git configurado (o copiar archivos manualmente)

### Pasos de Deployment

```bash
# 1. Conectar al VPS
ssh root@82.29.58.172

# 2. Navegar al proyecto backend
cd /ruta/al/portfolio-backend

# 3. Backup del código actual (por seguridad)
cp -r src src.backup-$(date +%Y%m%d-%H%M%S)

# 4. Opción A: Pull de cambios (si están en git)
git pull origin main

# 4. Opción B: Copiar archivos modificados manualmente
# (si no están en git aún)
# - src/services/newsletter/types.ts
# - src/services/newsletter/contact-resolver.ts
# - src/services/newsletter/batch-sender.ts
# - src/services/newsletter/queue-processor.ts

# 5. Rebuild del proyecto
npm run build

# 6. Verificar que compiló correctamente
# Debe terminar sin errores
ls -lh dist/services/newsletter/

# 7. Restart del worker con PM2
pm2 restart newsletter-worker

# 8. Verificar que el worker arrancó correctamente
pm2 status

# 9. Monitorear logs iniciales
pm2 logs newsletter-worker --lines 50
```

### Verificación Post-Restart

```bash
# El worker debe mostrar algo como:
# ╔══════════════════════════════════════════════════════╗
# ║     Newsletter Queue Worker - STARTING              ║
# ╚══════════════════════════════════════════════════════╝
# ✅ Configuration verified
# 🚀 Worker started - Press Ctrl+C to stop

# Verificar que está corriendo
pm2 list
# Debería mostrar newsletter-worker en status "online"

# Ver logs en tiempo real (Ctrl+C para salir)
pm2 logs newsletter-worker --follow
```

---

## 🧪 Plan de Testing

### Test 1: Campaña de Prueba Pequeña

**Objetivo**: Verificar que stages NO duplican emails.

#### Paso 1: Crear Campaña de Prueba

**Desde la UI** (`/admin/mailing/newsletter/dashboard`):

1. Crear newsletter de prueba con título: "TEST - Fix Stages [FECHA]"
2. Seleccionar lista de distribución con ~30 contactos
3. Configurar stages:
   - Stage size: **10 emails**
   - Delay: **5 minutos** (para poder monitorear)
   - Total esperado: 3 stages de 10 emails c/u

4. Click "Enviar con Stages"

#### Paso 2: Verificar Pre-Guardado de Recipients

```sql
-- Ver que la campaña se creó con 3 stages
SELECT
  campaign_id,
  stage_number,
  total_recipients,
  scheduled_at,
  status
FROM newsletter_queue
WHERE subject LIKE 'TEST - Fix Stages%'
ORDER BY stage_number;

/*
Debe mostrar:
campaign_id                          | stage_number | total_recipients | scheduled_at           | status
------------------------------------+--------------+------------------+------------------------+---------
<uuid>                              |      1       |        10        | 2025-10-XX XX:XX:XX   | pending
<uuid>                              |      2       |        10        | 2025-10-XX XX:XX:XX   | pending
<uuid>                              |      3       |        10        | 2025-10-XX XX:XX:XX   | pending
*/

-- Guardar el campaign_id para queries siguientes
\set campaign_id '<uuid-de-arriba>'

-- Verificar que recipients están guardados ANTES de enviar
SELECT
  nq.stage_number,
  COUNT(nqr.id) as recipients_guardados,
  COUNT(DISTINCT nqr.email) as emails_unicos
FROM newsletter_queue nq
JOIN newsletter_queue_recipients nqr ON nq.id = nqr.queue_id
WHERE nq.campaign_id = :'campaign_id'
GROUP BY nq.stage_number
ORDER BY nq.stage_number;

/*
Debe mostrar:
stage_number | recipients_guardados | emails_unicos
-------------+----------------------+---------------
     1       |          10          |      10
     2       |          10          |      10
     3       |          10          |      10
*/

-- ✅ VERIFICACIÓN CRÍTICA: Confirmar que NO hay overlaps entre stages
SELECT
  nqr.email,
  COUNT(*) as apariciones,
  array_agg(DISTINCT nq.stage_number ORDER BY nq.stage_number) as stages
FROM newsletter_queue nq
JOIN newsletter_queue_recipients nqr ON nq.id = nqr.queue_id
WHERE nq.campaign_id = :'campaign_id'
GROUP BY nqr.email
HAVING COUNT(*) > 1;

/*
Debe devolver: 0 rows
(Si devuelve algo, hay un bug en el frontend)
*/
```

#### Paso 3: Monitorear Ejecución del Stage 1

```bash
# En el VPS, seguir logs del worker
pm2 logs newsletter-worker --follow

# Cuando llegue el scheduled_at del Stage 1, debe mostrar:
# 🚀 Found pending job
# 🔒 Job locked for processing
# Fetching contacts...
# ✅ Found 10 pre-saved recipients for staged job  ← CRÍTICO
# Found 10 unique active contacts
# Sending 10 emails via Resend...
# Progress: 10/10 emails sent
# ✅ Updated 10 Resend IDs in tracking table  ← CRÍTICO
# Job completed
```

#### Paso 4: Verificar Resultados del Stage 1

```sql
-- Ver estado del Stage 1
SELECT
  stage_number,
  status,
  total_recipients,
  sent_count,
  failed_count,
  started_at,
  completed_at
FROM newsletter_queue
WHERE campaign_id = :'campaign_id'
ORDER BY stage_number;

/*
Stage 1 debe mostrar:
stage_number | status    | total_recipients | sent_count | failed_count
-------------+-----------+------------------+------------+-------------
     1       | completed |        10        |     10     |      0
     2       | pending   |        10        |      0     |      0
     3       | pending   |        10        |      0     |      0
*/

-- ✅ VERIFICACIÓN CRÍTICA: Confirmar que Resend IDs fueron guardados
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE resend_email_id IS NOT NULL) as con_resend_id,
  COUNT(*) FILTER (WHERE status = 'sent') as marcados_sent
FROM newsletter_queue_recipients nqr
JOIN newsletter_queue nq ON nqr.queue_id = nq.id
WHERE nq.campaign_id = :'campaign_id'
  AND nq.stage_number = 1;

/*
Debe mostrar:
total | con_resend_id | marcados_sent
------+---------------+--------------
  10  |      10       |      10
*/

-- Ver algunos ejemplos de Resend IDs guardados
SELECT
  email,
  resend_email_id,
  status,
  sent_at
FROM newsletter_queue_recipients nqr
JOIN newsletter_queue nq ON nqr.queue_id = nq.id
WHERE nq.campaign_id = :'campaign_id'
  AND nq.stage_number = 1
LIMIT 5;

/*
Debe mostrar emails con resend_email_id llenos:
email                    | resend_email_id                      | status | sent_at
-------------------------+--------------------------------------+--------+-----------------------
ejemplo@dominio.com      | re_abcd1234                          | sent   | 2025-10-XX XX:XX:XX
...
*/
```

#### Paso 5: Verificar que Stage 2 NO Duplica

```bash
# Esperar 5 minutos hasta que se ejecute Stage 2
# Monitorear logs del worker

# Debe mostrar:
# 🚀 Found pending job (stage 2)
# ✅ Found 10 pre-saved recipients for staged job  ← DEBE ser 10, NO 30
# Sending 10 emails via Resend...
# ✅ Updated 10 Resend IDs in tracking table
```

```sql
-- Verificar que Stage 2 envió solo a SUS 10 contactos
SELECT
  stage_number,
  sent_count
FROM newsletter_queue
WHERE campaign_id = :'campaign_id'
ORDER BY stage_number;

/*
Debe mostrar:
stage_number | sent_count
-------------+-----------
     1       |     10
     2       |     10     ← NO debe ser 30!
     3       |      0
*/

-- ✅ VERIFICACIÓN CRÍTICA: Confirmar NO hay duplicados
SELECT
  email,
  COUNT(*) as veces_enviado,
  array_agg(nq.stage_number ORDER BY nq.stage_number) as stages
FROM newsletter_queue_recipients nqr
JOIN newsletter_queue nq ON nqr.queue_id = nq.id
WHERE nq.campaign_id = :'campaign_id'
  AND nqr.status = 'sent'
GROUP BY email
HAVING COUNT(*) > 1;

/*
Debe devolver: 0 rows
(Si devuelve algo, el bug persiste)
*/
```

#### Paso 6: Esperar Stage 3 y Verificar Totales

```sql
-- Después de que Stage 3 se complete
SELECT
  COUNT(DISTINCT nqr.email) as emails_unicos_enviados,
  SUM(nq.sent_count) as total_envios,
  COUNT(*) as total_recipients_records
FROM newsletter_queue nq
JOIN newsletter_queue_recipients nqr ON nq.id = nqr.queue_id
WHERE nq.campaign_id = :'campaign_id';

/*
Debe mostrar:
emails_unicos_enviados | total_envios | total_recipients_records
-----------------------+--------------+-------------------------
          30           |      30      |           30

✅ 30 emails únicos enviados UNA VEZ cada uno
❌ Si total_envios > 30, hay duplicados
*/

-- Ver resumen por stage
SELECT
  nq.stage_number,
  COUNT(DISTINCT nqr.email) as emails_unicos,
  COUNT(*) as recipients_total,
  COUNT(*) FILTER (WHERE nqr.status = 'sent') as enviados,
  COUNT(*) FILTER (WHERE nqr.resend_email_id IS NOT NULL) as con_resend_id
FROM newsletter_queue nq
JOIN newsletter_queue_recipients nqr ON nq.id = nqr.queue_id
WHERE nq.campaign_id = :'campaign_id'
GROUP BY nq.stage_number
ORDER BY nq.stage_number;

/*
Debe mostrar:
stage_number | emails_unicos | recipients_total | enviados | con_resend_id
-------------+---------------+------------------+----------+---------------
     1       |      10       |        10        |    10    |      10
     2       |      10       |        10        |    10    |      10
     3       |      10       |        10        |    10    |      10
*/
```

---

### Test 2: Verificar Backward Compatibility (Envío Normal)

**Objetivo**: Confirmar que envíos normales (sin stages) siguen funcionando.

```sql
-- Crear un job de prueba sin campaign_id (envío normal legacy)
-- Usar la UI de envío normal (NO staged)

-- Verificar que el job NO tiene recipients pre-guardados
SELECT COUNT(*)
FROM newsletter_queue_recipients
WHERE queue_id = '<queue_id_del_envio_normal>';
-- Debe devolver: 0

-- Monitorear logs del worker cuando se ejecute:
# Debe mostrar:
# Fetching contacts...
# No pre-saved recipients found, will use list_ids fallback  ← CRÍTICO
# Using distribution lists (no pre-saved recipients found)
# Found X unique active contacts
# Sending X emails via Resend...

-- Verificar que el envío se completó correctamente
SELECT status, sent_count, failed_count
FROM newsletter_queue
WHERE id = '<queue_id>';
-- Debe mostrar: completed con sent_count > 0
```

---

## ✅ Verificación Post-Deployment

### Checklist de Verificación

- [ ] **Build exitoso** sin errores de TypeScript
- [ ] **Worker reiniciado** correctamente con PM2
- [ ] **Logs del worker** muestran inicio sin errores
- [ ] **Test 1 completo**: Campaña staged NO duplica emails
- [ ] **Test 2 completo**: Envío normal sigue funcionando
- [ ] **Resend IDs guardados** en `newsletter_queue_recipients`
- [ ] **Webhooks funcionando** (verificar en próximos días)

### Queries de Verificación Rápida

```sql
-- 1. Ver últimas campañas con stages
SELECT
  campaign_id,
  COUNT(*) as stages,
  MIN(subject) as subject,
  SUM(sent_count) as total_enviado
FROM newsletter_queue
WHERE campaign_id IS NOT NULL
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY campaign_id
ORDER BY MIN(created_at) DESC
LIMIT 5;

-- 2. Verificar que recipients tienen Resend IDs
SELECT
  nq.subject,
  COUNT(*) as recipients,
  COUNT(*) FILTER (WHERE nqr.resend_email_id IS NOT NULL) as con_resend_id,
  ROUND(100.0 * COUNT(*) FILTER (WHERE nqr.resend_email_id IS NOT NULL) / COUNT(*), 2) as porcentaje
FROM newsletter_queue nq
JOIN newsletter_queue_recipients nqr ON nq.id = nqr.queue_id
WHERE nq.created_at > NOW() - INTERVAL '7 days'
  AND nq.status = 'completed'
GROUP BY nq.id, nq.subject
ORDER BY nq.created_at DESC
LIMIT 5;

-- 3. Detectar posibles duplicados
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
HAVING COUNT(*) > 1;
-- Debe devolver: 0 rows

-- 4. Ver estado del worker
SELECT
  instance_id,
  status,
  started_at,
  last_heartbeat_at,
  jobs_processed,
  jobs_failed,
  AGE(NOW(), last_heartbeat_at) as ultima_actividad
FROM worker_sessions
WHERE status = 'running'
ORDER BY started_at DESC
LIMIT 1;
```

---

## 🔧 Troubleshooting

### Problema: Worker no arranca después del restart

**Síntomas**:
```bash
pm2 status
# newsletter-worker | status: errored
```

**Solución**:
```bash
# Ver logs de error
pm2 logs newsletter-worker --err --lines 50

# Posibles causas:
# 1. Error de compilación TypeScript
npm run build
# Si hay errores, revisar cambios

# 2. Error de conexión a BD
# Verificar variables de entorno
pm2 env newsletter-worker

# 3. Permisos
ls -lh dist/worker.js
chmod +x dist/worker.js

# Restart manual
pm2 delete newsletter-worker
pm2 start dist/worker.js --name newsletter-worker
```

---

### Problema: Stages siguen duplicando

**Síntomas**:
```sql
SELECT COUNT(*) FROM newsletter_queue_recipients
WHERE email = 'ejemplo@test.com' AND status = 'sent';
-- Devuelve: 2 o más (DUPLICADO)
```

**Diagnóstico**:
```bash
# Verificar logs del worker cuando procesó el stage
pm2 logs newsletter-worker --lines 200 | grep -A 10 "Found pending job"

# Debe mostrar:
# ✅ Found 10 pre-saved recipients for staged job
# ❌ Si muestra: "Using distribution lists (no pre-saved recipients found)"
#    El código NO se actualizó correctamente
```

**Solución**:
```bash
# 1. Verificar que los archivos están actualizados
cd /ruta/al/portfolio-backend
cat src/services/newsletter/queue-processor.ts | grep "getRecipientsForJob"
# Debe mostrar la línea con getRecipientsForJob

# 2. Verificar que se compiló correctamente
cat dist/services/newsletter/queue-processor.js | grep "getRecipientsForJob"
# Debe aparecer

# 3. Si NO aparece, rebuild forzado
rm -rf dist/
npm run build
pm2 restart newsletter-worker
```

---

### Problema: Resend IDs no se guardan

**Síntomas**:
```sql
SELECT COUNT(*) FROM newsletter_queue_recipients
WHERE queue_id = '<queue_id>' AND resend_email_id IS NOT NULL;
-- Devuelve: 0
```

**Diagnóstico**:
```bash
# Ver logs del worker
pm2 logs newsletter-worker | grep "Updated.*Resend IDs"

# Si NO aparece el mensaje:
# ❌ "Updated X Resend IDs in tracking table"
# El código del batch-sender NO retorna emailIds
```

**Solución**:
```bash
# Verificar que batch-sender.ts tiene el cambio
cat src/services/newsletter/batch-sender.ts | grep "emailIds"
# Debe mostrar múltiples líneas con emailIds

# Rebuild y restart
npm run build
pm2 restart newsletter-worker
```

---

### Problema: Worker muestra "No pre-saved recipients" para campaigns staged

**Síntomas**:
```bash
pm2 logs newsletter-worker
# Muestra: "No pre-saved recipients found, will use list_ids fallback"
# Para un job CON campaign_id
```

**Diagnóstico**:
```sql
-- Verificar que recipients están en la BD
SELECT COUNT(*)
FROM newsletter_queue_recipients
WHERE queue_id = '<queue_id>';

-- Si devuelve 0: El frontend NO guardó recipients
-- Si devuelve > 0: El backend NO los está encontrando
```

**Solución si recipients SÍ están guardados**:
```bash
# Posible causa: Prisma client desactualizado
cd /ruta/al/portfolio-backend
npx prisma generate
npm run build
pm2 restart newsletter-worker
```

**Solución si recipients NO están guardados**:
- El problema está en el frontend
- Verificar `/app/api/admin/mailing/newsletter/send-staged/route.ts`
- Los recipients deben guardarse ANTES de crear el job

---

## 🔄 Rollback Plan

Si el fix causa problemas críticos, seguir estos pasos:

### Paso 1: Restaurar código anterior

```bash
# Conectar al VPS
ssh root@82.29.58.172
cd /ruta/al/portfolio-backend

# Verificar que existe el backup
ls -lh src.backup-*
# Debe mostrar el backup creado durante deployment

# Restaurar desde backup
rm -rf src/
mv src.backup-YYYYMMDD-HHMMSS src/

# O si está en git
git reset --hard HEAD~1  # Solo si el commit fue el fix
```

### Paso 2: Rebuild y restart

```bash
npm run build
pm2 restart newsletter-worker
pm2 logs newsletter-worker --lines 20
```

### Paso 3: Verificar que volvió al comportamiento anterior

```bash
pm2 logs newsletter-worker

# Debe mostrar el comportamiento viejo:
# Fetching contacts...
# Found X unique active contacts  (sin mención de "pre-saved recipients")
```

### Paso 4: Cancelar manualmente cualquier stage pendiente

```sql
UPDATE newsletter_queue
SET
  status = 'cancelled',
  completed_at = NOW(),
  error_message = 'Rollback del fix - cancelado manualmente'
WHERE status = 'pending'
  AND campaign_id IS NOT NULL;
```

---

## 📝 Notas Finales

### Monitoreo Post-Fix

Durante los próximos **7 días** después del deployment:

1. **Revisar logs diariamente**:
   ```bash
   pm2 logs newsletter-worker --lines 100 | grep -E "pre-saved|Resend IDs|duplicate"
   ```

2. **Query diario de verificación**:
   ```sql
   -- Ver si hay duplicados en últimas 24 horas
   SELECT
     nq.campaign_id,
     nqr.email,
     COUNT(*) as veces
   FROM newsletter_queue nq
   JOIN newsletter_queue_recipients nqr ON nq.id = nqr.queue_id
   WHERE nq.created_at > NOW() - INTERVAL '24 hours'
     AND nqr.status = 'sent'
   GROUP BY nq.campaign_id, nqr.email
   HAVING COUNT(*) > 1;
   ```

3. **Revisar Resend Dashboard** para confirmar que los números coinciden con la BD

### Actualizaciones Pendientes

Una vez confirmado que el fix funciona:

1. **Actualizar CLAUDE.md**:
   - Marcar el bug como RESUELTO
   - Cambiar estado de 🔴 NO USAR STAGES a ✅ STAGES FUNCIONANDO

2. **Documentar en README del backend**:
   - Agregar sección sobre el sistema de stages
   - Explicar la lógica de fallback

3. **Crear tests automatizados**:
   - Test unitario para `getRecipientsForJob()`
   - Test de integración para el flujo completo

---

**FIN DEL DOCUMENTO**

Para cualquier duda o problema, contactar al equipo de desarrollo.
