# 🚀 Deployment Checklist - Fix Newsletter Stages

**Fecha de fix**: 28 octubre 2025
**Archivos modificados**: 4 archivos en `/src/services/newsletter/`
**Doc completa**: `FIX_NEWSLETTER_STAGES.md`

---

## ✅ Pre-Deployment

- [ ] Archivos modificados están en el VPS
- [ ] Backup del código actual creado
- [ ] PM2 configurado y funcionando

---

## 🚀 Deployment (5 minutos)

```bash
# 1. SSH al VPS
ssh root@82.29.58.172

# 2. Navegar y backup
cd /ruta/al/portfolio-backend
cp -r src src.backup-$(date +%Y%m%d-%H%M%S)

# 3. Actualizar código (git pull o copiar archivos)
# ...

# 4. Rebuild
npm run build

# 5. Restart worker
pm2 restart newsletter-worker

# 6. Verificar
pm2 status
pm2 logs newsletter-worker --lines 20
```

**Debe mostrar**:
```
✅ Configuration verified
🚀 Worker started
```

---

## 🧪 Testing (15 minutos)

### Test Rápido con SQL

```bash
# En el VPS, ejecutar script de verificación
psql "postgresql://bis_user:DomingaDos2@82.29.58.172:5432/bis_local" \
  -f scripts/verify-stages-fix.sql
```

**Debe mostrar**:
- ✅ NO hay duplicados
- ✅ Worker activo
- ✅ Resend IDs guardados (si hay stages completados)

### Test Completo (Campaña de Prueba)

1. Crear campaña TEST con 3 stages de 10 emails
2. Verificar pre-guardado de recipients:
   ```sql
   SELECT stage_number, COUNT(*) FROM newsletter_queue_recipients
   WHERE queue_id IN (SELECT id FROM newsletter_queue WHERE subject LIKE 'TEST%')
   GROUP BY stage_number;
   -- Debe mostrar: 10, 10, 10
   ```
3. Monitorear logs cuando se ejecute Stage 1:
   ```bash
   pm2 logs newsletter-worker --follow
   # Debe decir: "Found 10 pre-saved recipients"
   ```
4. Verificar NO duplicación:
   ```sql
   SELECT email, COUNT(*) FROM newsletter_queue_recipients
   WHERE status = 'sent' AND queue_id IN (...)
   GROUP BY email HAVING COUNT(*) > 1;
   -- Debe devolver: 0 rows
   ```

---

## ✅ Post-Deployment

- [ ] Script de verificación ejecutado sin ❌
- [ ] Test de campaña pequeña completado
- [ ] NO hay duplicados confirmado
- [ ] Worker funcionando correctamente
- [ ] CLAUDE.md actualizado con resultado

---

## 🆘 Si algo sale mal

### Rollback rápido

```bash
# Restaurar backup
rm -rf src/
mv src.backup-YYYYMMDD-HHMMSS src/
npm run build
pm2 restart newsletter-worker
```

### Cancelar stages pendientes

```sql
UPDATE newsletter_queue
SET status = 'cancelled', error_message = 'Rollback del fix'
WHERE status = 'pending' AND campaign_id IS NOT NULL;
```

---

## 📞 Soporte

**Documentación completa**: `FIX_NEWSLETTER_STAGES.md`
- Sección **Troubleshooting** con soluciones paso a paso
- Sección **Testing** con queries SQL detalladas
- Sección **Rollback** con plan de contingencia

**Queries útiles**:
```bash
# Ver últimos logs
pm2 logs newsletter-worker --lines 100

# Estado del worker
pm2 status

# Verificar duplicados
psql ... -f scripts/verify-stages-fix.sql
```

---

**IMPORTANTE**: No usar sistema de stages en producción hasta completar este checklist.
