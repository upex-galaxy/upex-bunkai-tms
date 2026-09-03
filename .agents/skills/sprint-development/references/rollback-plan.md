# Prompt: Rollback Plan

## Cuándo hacer rollback

- Smoke tests fallan en producción
- Errores críticos reportados
- Performance degradada significativamente
- Bug de seguridad detectado

## Proceso de Rollback

### Vercel

```bash
# 1. En Vercel dashboard:
# - Find previous working deployment
# - Click "Promote to Production"
# - O usar CLI:
vercel rollback [deployment-url]
```

### Post-Rollback

1. Validar que producción funciona
2. Investigar causa del problema
3. Fix en develop
4. Re-testear en staging
5. Re-deploy cuando esté listo

## Output

- Producción estable
- RCA (Root Cause Analysis) documentado
