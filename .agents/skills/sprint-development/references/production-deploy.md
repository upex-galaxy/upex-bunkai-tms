# Prompt: Deploy to Production

## Estrategia

Deploy gradual con feature flags si es posible.

## Required skills

**Required skills (load before the promotion):** `/deploy-to-vercel` (deploy method, category `deploy`) next to T1 `/vercel-cli` (deployment verification by commit SHA, env sync, logs, rollback). When the story sends or templates email, also `/resend-cli` (category `email`) before checking the sender and the templates on the target environment. Not installed → say so once, point at `bun setup` or the single `bunx skills add` line from `PROJECT_LEVEL_SKILLS` in `cli/install.ts`, then continue (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).

## Proceso

### Automático (Vercel/Railway)

```bash
# 1. Promover a producción
# <production>  = git_strategy.branches.production  (.agents/project.yaml)
# <integration> = git_strategy.branches.integration (null en solo-main,
#   github-flow, trunk-based: ahí Stage 5 es mergear el PR de la historia a <production>)
# Método de promoción: git_strategy.decisions.promote_method, vía /git-flow-master.
git checkout <production>
git pull origin <production>
git merge --ff-only <integration>   # o el método que promote_method nombre
# Push directo a rama protegida: lo resuelve git_strategy.policy.direct_push_to_protected
git push origin <production>

# 2. Vercel auto-deploya a producción
# Monitorear en dashboard
```

### Post-Deploy

1. Smoke tests automáticos (Stage 5, post-deploy)
2. Monitoreo activo (primeras 2-4 horas)
3. Validar métricas de negocio

## Output

- URL de producción funcionando
- Smoke tests pasando
- Monitoreo activo
