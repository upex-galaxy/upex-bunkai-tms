# Prompt: Pre-Deploy Checklist

## Contexto

Antes de desplegar a producción, validar que todo está listo.

## Checklist

### 1. Tests (dev scope)

- [ ] Unit tests pasando (100%)
- [ ] Type-check pasando (`{{stack.package_manager}} run {{stack.scripts.types}}`)
- [ ] Lint pasando (`{{stack.package_manager}} run {{stack.scripts.lint}}`)
- [ ] Build de producción exitoso (`{{stack.package_manager}} run {{stack.scripts.build}}`)
- [ ] Un rol null en `stack.scripts` está nombrado como check omitido, no dado por bueno
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
- [ ] Cambios de base de datos listos (si aplica): cada uno aplicado y verificado en el ambiente de integración, presente en `list_migrations` del DB MCP, y con su plan de aplicación a producción según `{{stack.database.migrations_tool}}` (`agentic-dev-core/references/db-change-doctrine.md`)
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
