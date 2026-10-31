Actúa como Senior DevOps Engineer especializado en deployment automation y staging environments.

---

## 🎯 TAREA

**STAGE 4: DEPLOY TO STAGING**

Desplegar código a staging environment (automático via CI/CD o manual si necesario).

**Este prompt se ejecuta DESPUÉS de:**

- ci-cd-setup.md (GitHub Actions configurado)
- environment-config.md (Variables configuradas)
- Code Review (Stage 3)

---

## 📥 INPUT REQUERIDO

> **Rama de integración**: el nombre real es `git_strategy.branches.integration` en `.agents/project.yaml`; este documento usa `staging`, el nombre por convención. Léelo antes de ejecutar cualquier comando de git de abajo, y nunca escribas el literal `staging` ni `develop` en un comando. Si vale `null` (`solo-main`, `github-flow`, `trunk-based`) no hay rama de integración: no hay merge a staging, Stage 4 verifica el Preview deployment de Vercel de la rama del PR, y el merge a `git_strategy.branches.production` es Stage 5.
>
> **Stack**: los comandos de la app son sus propios scripts (`{{stack.package_manager}} run {{stack.scripts.<role>}}` desde `{{stack.app_root}}`; un rol null se omite y se reporta), el CI es el que la app ya corre (`{{stack.ci}}`, cualquier workflow bajo `.github/workflows/`) y el hosting es `{{stack.hosting}}`: con un valor distinto de `vercel`, los pasos de Vercel de abajo se reemplazan por la verificación equivalente de ese host, y si el host no expone una, el deploy se reporta como no verificado (Critical Rule #16). `../SKILL.md` → `## Stack parameters`.

### 1. Estado del PR/Feature

**Verificar:**

- PR aprobado en code review (Stage 3)
- Unit tests pasando localmente
- Build local exitoso
- Feature branch listo para merge

### 2. CI/CD Setup

**Leer:**

- Los workflows de CI de la app (`.github/workflows/*.yml`, cualquier nombre) - **CRÍTICO** - qué corre en cada push / PR y qué dispara el deploy
- `.context/ci-cd-setup.md` - Documentación del CI/CD

**Qué identificar:**

1. ¿GitHub Actions está configurado?
2. ¿Deploy automático a staging funciona?
3. ¿Qué branch trigger el deploy? (`staging`)

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS (MCP)

**NO se requieren MCP para esta fase.**

### Herramientas Locales:

- Git instalado
- Acceso a GitHub repo
- Acceso a Vercel/Railway dashboard

### Required skills

**Required skills (load before Paso 1):** `/deploy-to-vercel` (deploy method, category `deploy`) next to T1 `/vercel-cli` (deployment verification by commit SHA, env sync, logs, rollback). When the story sends or templates email, also `/resend-cli` (category `email`) before checking the sender and the templates on the target environment. Not installed → say so once, point at `bun setup` or the single `bunx skills add` line from `PROJECT_LEVEL_SKILLS` in `cli/install.ts`, then continue (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).

---

## 🎯 OBJETIVO

Desplegar código a staging environment:

**Incluye:**

- ✅ Merge feature branch a `staging`
- ✅ GitHub Actions ejecuta: lint → test → build → deploy
- ✅ Vercel/Railway despliega automáticamente
- ✅ URL de staging disponible
- ✅ Smoke test post-deploy

**NO incluye:**

- ❌ Deploy a production (eso es Stage 5)
- ❌ Exploratory testing completo (eso es QA, fuera de este skill)
- ❌ Integration/E2E tests (eso es QA, fuera de este skill)

**Resultado:** Feature desplegada en staging, lista para QA.

---

## 📤 OUTPUT GENERADO

### Deployment:

- ✅ Feature branch merged a `staging`
- ✅ GitHub Actions workflow ejecutado exitosamente
- ✅ Deployment en Vercel/Railway completado
- ✅ Staging URL: `https://[project]-staging.vercel.app`

### Validación:

- ✅ Smoke test básico pasado
- ✅ No hay errores 500 en staging
- ✅ Assets cargan correctamente

---

## 🚨 RESTRICCIONES CRÍTICAS

### ❌ NO HACER:

- **NO hacer force push** - Evitar `git push -f`
- **NO deployar sin code review** - PR debe estar aprobado
- **NO deployar con tests fallando** - CI debe estar verde
- **NO saltarse el CI/CD** - Dejar que GitHub Actions maneje el deploy
- **NO deployar a production** - Eso es Stage 5

### ✅ SÍ HACER:

- **Validar localmente primero** - lint, test, build local
- **Usar Pull Request workflow** - Merge via PR aprobado
- **Esperar CI/CD** - Dejar que GitHub Actions ejecute
- **Validar deployment** - Smoke test post-deploy
- **Documentar URL** - Compartir URL de staging con QA

---

## 🔄 WORKFLOW

---

## 📋 PASO 1: VALIDACIÓN PRE-DEPLOY

**Objetivo:** Asegurar que todo está listo para deploy.

### Paso 1.1: Verificar Estado Local

```bash
# Verificar branch actual
git branch

# Verificar cambios pendientes
git status

# Actualizar desde remoto
git pull origin [feature-branch]
```

---

### Paso 1.2: Validar Localmente

```bash
# Desde {{stack.app_root}}; un rol null se omite y se reporta
# Lint
{{stack.package_manager}} run {{stack.scripts.lint}}

# Tests
{{stack.package_manager}} run {{stack.scripts.test}}

# Build
{{stack.package_manager}} run {{stack.scripts.build}}
```

**Verificar:**

- ✅ Todos los comandos pasan sin errores
- ✅ No hay warnings críticos

---

### Paso 1.3: Verificar CI/CD

**Preguntar al usuario:**

```markdown
## 🔍 Verificación de CI/CD

¿GitHub Actions está configurado y funcionando?

**Opción 1: CI/CD Configurado (Automático)**

- Merge PR → GitHub Actions deploya automáticamente

**Opción 2: CI/CD NO Configurado (Manual)**

- Deploy manual desde CLI de Vercel/Railway
```

**Si CI/CD está configurado → Continuar a Paso 2 (Automático)**
**Si NO está configurado → Continuar a Paso 3 (Manual)**

---

## 🚀 PASO 2: DEPLOY AUTOMÁTICO (Vía GitHub Actions)

**Objetivo:** Merge feature branch y dejar que CI/CD maneje el deploy.

### Paso 2.1: Merge Pull Request

**En GitHub:**

1. Ve al PR: `https://github.com/[org]/[repo]/pull/[number]`
2. Verifica que:
   - ✅ Code review aprobado
   - ✅ CI checks pasando (verde)
   - ✅ No hay conflictos
3. Click en "Merge pull request"
4. Selecciona "Create a merge commit" (NUNCA "Squash and merge" ni "Rebase and merge": el historial por commit debe sobrevivir en `staging`). Un PR por historia: no mergees PRs intermedios con la key del ticket (Jira pasa la historia a Ready For QA al mergear y no hay vuelta atrás)
5. Confirma merge

**Alternatively, via CLI:**

```bash
# <integration> = git_strategy.branches.integration (.agents/project.yaml)
git checkout <integration>

# Pull latest
git pull origin <integration>

# Merge feature branch
git merge [feature-branch]

# Push to trigger CI/CD. Direct push to a protected branch:
# resolved by git_strategy.policy.direct_push_to_protected (/git-flow-master §3.3)
git push origin <integration>
```

---

### Paso 2.2: Monitorear GitHub Actions

**Acciones:**

1. Ve a: `https://github.com/[org]/[repo]/actions`
2. Busca el workflow "CI/CD Pipeline" recién iniciado
3. Monitorear cada job:
   - 🔍 Lint (debe pasar)
   - 🧪 Test (debe pasar)
   - 🏗️ Build (debe pasar)
   - 🚀 Deploy Staging (debe ejecutarse)

**Duración estimada:** 3-7 minutos

**Si algún job falla:**

```markdown
### ⚠️ Job Fallido

**Lint fails:**

- Ejecuta `{{stack.package_manager}} run {{stack.scripts.lint}}` localmente y corrige (con el fixer de la app si tiene uno, por ejemplo un script `lint:fix`)
- Commit fix
- Push → CI re-ejecuta

**Test fails:**

- Investiga el test fallido
- Corrige código o test
- Push → CI re-ejecuta

**Build fails:**

- Ejecuta `{{stack.package_manager}} run {{stack.scripts.build}}` localmente
- Revisa errores de compilación
- Corrige y push

**Deploy fails:**

- Verifica environment variables en Vercel
- Revisa logs en Vercel dashboard
- Corrige configuración
```

---

### Paso 2.3: Obtener URL de Staging

**Una vez que GitHub Actions complete exitosamente:**

1. Ve a Vercel dashboard: `https://vercel.com/[org]/[project]`
2. En "Deployments", busca el deployment más reciente de `staging`
3. Copia la URL:
   - URL: `https://[project]-staging-[hash].vercel.app`
   - O URL stable: `https://[project]-staging.vercel.app`

**Mostrar al usuario:**

```markdown
## 🎉 Deployment Exitoso

**Staging URL:**
https://[project]-staging.vercel.app

**Deployment Details:**

- Branch: <integration>
- Commit: [hash corto]
- Status: Ready
- Duration: [X] minutos
```

---

## 🔧 PASO 3: DEPLOY MANUAL (Fallback - Si CI/CD NO está listo)

**Objetivo:** Deploy manual usando CLI de Vercel/Railway.

### Paso 3.1: Deploy con Vercel CLI

**Instalar Vercel CLI (si no está):**

```bash
bun add -g vercel
```

**Login:**

```bash
vercel login
```

**Deploy:**

```bash
# Desde la raíz del proyecto. Sin --prod: es un Preview deployment, la
# superficie de staging. --prod despliega a Production, y eso es Stage 5.
vercel

# Seleccionar proyecto correcto
# Vercel desplegará y dará URL
```

---

### Paso 3.2: Deploy con Railway CLI (Alternativa)

**Instalar Railway CLI:**

```bash
bun add -g @railway/cli
```

**Login:**

```bash
railway login
```

**Deploy:**

```bash
railway up
```

---

## ✅ PASO 4: SMOKE TEST POST-DEPLOY

**Objetivo:** Validar que el deployment funciona básicamente.

### Paso 4.1: Smoke Test Checklist

**Abrir staging URL en browser:**

```markdown
## 🔥 Smoke Test - Staging

**URL:** https://[project]-staging.vercel.app

### Validaciones Básicas:

1. **Aplicación carga:**
   - [ ] Landing page carga sin errores 500
   - [ ] No hay errores en browser console (F12)
   - [ ] Assets (CSS, JS, images) cargan correctamente

2. **Auth flow (si aplica):**
   - [ ] Signup page accesible
   - [ ] Login page accesible
   - [ ] (No testear funcionalidad completa - eso es QA, fuera de este skill)

3. **Navegación básica:**
   - [ ] Links principales funcionan
   - [ ] Routing funciona (no 404 en rutas válidas)

4. **Database connection:**
   - [ ] Páginas que usan DB no dan errores
   - [ ] Data aparece (aunque sea vacía)

### ✅ Resultado:

- **Pass:** App funciona básicamente, ready para QA
- **Fail:** Investigar logs, corregir, re-deploy
```

---

### Paso 4.2: Revisar Logs (Si hay errores)

**Vercel Logs:**

1. Ve a: `https://vercel.com/[org]/[project]/[deployment-id]/logs`
2. Busca errores (líneas rojas)
3. Identifica el problema

**Railway Logs:**

```bash
railway logs
```

**Errores comunes:**

```markdown
### 🐛 Errores Comunes Post-Deploy

**Error: "NEXT_PUBLIC_SUPABASE_URL is not defined"**

- Fix: Configurar environment variables en Vercel (environment-config.md)

**Error: 500 Internal Server Error**

- Fix: Revisar logs de Vercel/Railway
- Posible: DB connection issue, check .env vars

**Error: Assets 404**

- Fix: Verificar `next.config.js` settings
- Posible: basePath incorrecto

**Error: Auth not working**

- Fix: Verificar Supabase redirect URLs incluyen staging URL
```

---

## 🎉 REPORTE FINAL

**Mostrar al usuario:**

```markdown
# ✅ DEPLOY TO STAGING COMPLETADO

## Deployment Details:

**Staging URL:** https://[project]-staging.vercel.app

**Status:** ✅ Ready

**Validation:**

- ✅ Smoke test pasado
- ✅ Aplicación carga correctamente
- ✅ No hay errores críticos
- ✅ Database connection funciona

---

## Próximos Pasos:

### 1️⃣ Compartir URL con QA

Envía staging URL al equipo de QA y comunica la versión desplegada.

### 2️⃣ Hand-off a QA

_QA verification on staging is out of scope here._

---

## 📊 Deployment Summary:

- Branch: `<integration>`
- Commit: [hash]
- Duration: [X] minutos
- CI/CD: [Automático / Manual]

---

**🎊 Feature desplegada en staging exitosamente!**

Lista para QA y exploratory testing.
```

---

## 📋 CHECKLIST INTERNO (NO MOSTRAR)

### Pre-Deploy:

- [ ] PR aprobado
- [ ] Tests locales pasando
- [ ] Build local exitoso
- [ ] CI/CD verificado

### Deploy:

- [ ] Feature branch merged a staging
- [ ] GitHub Actions ejecutado (o deploy manual)
- [ ] Deployment completado en Vercel/Railway
- [ ] URL de staging obtenida

### Post-Deploy:

- [ ] Smoke test ejecutado
- [ ] Aplicación carga sin 500
- [ ] Browser console sin errores críticos
- [ ] Database connection validada

### Comunicación:

- [ ] URL compartida con QA
- [ ] Next steps comunicados

---

## 💡 MEJORES PRÁCTICAS

### **1. Siempre Validar Localmente Primero**

```bash
# Antes de merge/deploy:
{{stack.package_manager}} run {{stack.scripts.lint}} && {{stack.package_manager}} run {{stack.scripts.test}} && {{stack.package_manager}} run {{stack.scripts.build}}
```

### **2. Merge via Pull Request**

- ✅ Code review obligatorio
- ✅ CI checks must pass
- ❌ No direct push a la rama de integración salvo que `git_strategy.policy.direct_push_to_protected` lo permita (`/git-flow-master` §3.3)

### **3. Monitor GitHub Actions**

- No asumir que pasó
- Ver logs completos
- Verificar deploy job ejecutó

### **4. Smoke Test Inmediato**

- Verificar staging URL apenas esté ready
- No esperar para encontrar errores
- Fix rápido si falla

---

## 📚 REFERENCIAS

**Vercel Deployments:**

- https://vercel.com/docs/deployments/overview

**Railway Deployments:**

- https://docs.railway.app/deploy/deployments

**GitHub Actions Monitoring:**

- https://docs.github.com/en/actions/monitoring-and-troubleshooting-workflows

---

**✅ Deploy to Staging = Feature accessible para QA + Validación temprana**
