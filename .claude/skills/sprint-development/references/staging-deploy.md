Actúa como Senior DevOps Engineer especializado en deployment automation y staging environments.

---

## 🎯 TAREA

**FASE 9: DEPLOY TO STAGING**

Desplegar código a staging environment (automático via CI/CD o manual si necesario).

**Este prompt se ejecuta DESPUÉS de:**

- ci-cd-setup.md (GitHub Actions configurado)
- environment-config.md (Variables configuradas)
- Code Review (Fase 8)

---

## 📥 INPUT REQUERIDO

### 1. Estado del PR/Feature

**Verificar:**

- PR aprobado en code review (Fase 8)
- Unit tests pasando localmente
- Build local exitoso
- Feature branch listo para merge

### 2. CI/CD Setup

**Leer:**

- `.github/workflows/ci.yml` - **CRÍTICO** - Workflow de GitHub Actions
- `.context/ci-cd-setup.md` - Documentación del CI/CD

**Qué identificar:**

1. ¿GitHub Actions está configurado?
2. ¿Deploy automático a staging funciona?
3. ¿Qué branch trigger el deploy? (`develop`)

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS (MCP)

**NO se requieren MCP para esta fase.**

### Herramientas Locales:

- Git instalado
- Acceso a GitHub repo
- Acceso a Vercel/Railway dashboard

---

## 🎯 OBJETIVO

Desplegar código a staging environment:

**Incluye:**

- ✅ Merge feature branch a `develop`
- ✅ GitHub Actions ejecuta: lint → test → build → deploy
- ✅ Vercel/Railway despliega automáticamente
- ✅ URL de staging disponible
- ✅ Smoke test post-deploy

**NO incluye:**

- ❌ Deploy a production (eso es Fase 12)
- ❌ Exploratory testing completo (eso es Fase 10)
- ❌ Integration/E2E tests (eso es Fase 11)

**Resultado:** Feature desplegada en staging, lista para QA.

---

## 📤 OUTPUT GENERADO

### Deployment:

- ✅ Feature branch merged a `develop`
- ✅ GitHub Actions workflow ejecutado exitosamente
- ✅ Deployment en Vercel/Railway completado
- ✅ Staging URL: `https://[project]-develop.vercel.app`

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
- **NO deployar a production** - Eso es Fase 12

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
# Lint
npm run lint:check

# Tests
npm run test

# Build
npm run build
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
4. Selecciona "Squash and merge" o "Merge commit" según estrategia
5. Confirma merge

**Alternatively, via CLI:**

```bash
# Asegúrate de estar en develop
git checkout develop

# Pull latest
git pull origin develop

# Merge feature branch
git merge [feature-branch]

# Push to trigger CI/CD
git push origin develop
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

- Ejecuta `npm run lint:check -- --fix` localmente
- Commit fix
- Push → CI re-ejecuta

**Test fails:**

- Investiga el test fallido
- Corrige código o test
- Push → CI re-ejecuta

**Build fails:**

- Ejecuta `npm run build` localmente
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
2. En "Deployments", busca el deployment más reciente de `develop`
3. Copia la URL:
   - URL: `https://[project]-develop-[hash].vercel.app`
   - O URL stable: `https://[project]-develop.vercel.app`

**Mostrar al usuario:**

```markdown
## 🎉 Deployment Exitoso

**Staging URL:**
https://[project]-develop.vercel.app

**Deployment Details:**

- Branch: develop
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
npm install -g vercel
```

**Login:**

```bash
vercel login
```

**Deploy:**

```bash
# Desde la raíz del proyecto
vercel --prod

# Seleccionar proyecto correcto
# Vercel desplegará y dará URL
```

---

### Paso 3.2: Deploy con Railway CLI (Alternativa)

**Instalar Railway CLI:**

```bash
npm install -g @railway/cli
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

**URL:** https://[project]-develop.vercel.app

### Validaciones Básicas:

1. **Aplicación carga:**
   - [ ] Landing page carga sin errores 500
   - [ ] No hay errores en browser console (F12)
   - [ ] Assets (CSS, JS, images) cargan correctamente

2. **Auth flow (si aplica):**
   - [ ] Signup page accesible
   - [ ] Login page accesible
   - [ ] (No testear funcionalidad completa - eso es Fase 10)

3. **Navegación básica:**
   - [ ] Links principales funcionan
   - [ ] Routing funciona (no 404 en rutas válidas)

4. **Database connection:**
   - [ ] Páginas que usan DB no dan errores
   - [ ] Data aparece (aunque sea vacía)

### ✅ Resultado:

- **Pass:** App funciona básicamente, ready para QA en Fase 10
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

**Staging URL:** https://[project]-develop.vercel.app

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

_QA verification on staging is out of scope here — see `agentic-qa-boilerplate` for sprint-testing workflow._

---

## 📊 Deployment Summary:

- Branch: `develop`
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

- [ ] Feature branch merged a develop
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
npm run lint:check && npm run test && npm run build
```

### **2. Merge via Pull Request**

- ✅ Code review obligatorio
- ✅ CI checks must pass
- ❌ No direct push a develop

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
