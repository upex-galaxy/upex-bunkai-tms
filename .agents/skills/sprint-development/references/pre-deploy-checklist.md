# Prompt: Pre-Deploy Checklist

## Contexto

Antes de desplegar a producción, validar que todo está listo.

## Checklist

### 1. Tests (dev scope)

- [ ] Unit tests pasando (100%)
- [ ] Type-check (`tsc --noEmit`) pasando
- [ ] Lint pasando
- [ ] Build de producción exitoso
- [ ] Dev smoke checks OK en staging (curl health endpoint, verify deploy version, basic UI load — not QA test suite)

> Full QA verification (E2E, exploratory, regression) is out of scope here.

### 2. Code Quality

- [ ] Code review aprobado
- [ ] No hay TODOs críticos
- [ ] Linting pasando
- [ ] Security scan OK

### 3. Infraestructura

- [ ] Variables de entorno configuradas en producción
- [ ] Secrets configurados correctamente
- [ ] Database migrations ready (si aplica)
- [ ] Backup de producción reciente

### 4. Monitoreo

- [ ] Sentry/DataDog configurado
- [ ] Alertas configuradas
- [ ] Dashboards listos

### 5. Stakeholders

- [ ] PM aprobó deployment
- [ ] QA dio go/no-go (validación QA gestionada en su propio flujo)
- [ ] DevOps listo para monitorear

## Output

✅ Listo para deploy a producción
