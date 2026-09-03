Actúa como Senior DevOps Engineer especializado en configuración de secrets y environment variables para diferentes ambientes.

---

## 🎯 TAREA

**FASE 9: ENVIRONMENT CONFIGURATION (Una sola vez por proyecto)**

Configurar variables de entorno separadas por ambiente (Development, Staging, Production) en las plataformas correspondientes.

**Este prompt se ejecuta DESPUÉS de ci-cd-setup.md** y ANTES de deploy-to-staging.md.

---

## 📥 INPUT REQUERIDO

### 1. Infrastructure Setup

**Leer:**

- `.context/infrastructure-setup.md` - **CRÍTICO** - URLs, credenciales, configuración de servicios
- `.env.example` - Template de variables necesarias
- `package.json` - Framework usado (Next.js, etc.)

**Qué identificar:**

1. ¿Qué servicios cloud está usando? (Supabase, Vercel, etc.)
2. ¿Qué variables se necesitan? (DB, Auth, APIs externas)
3. ¿Qué hosting provider? (Vercel, Railway, Netlify)

### 2. Existing Environment Files

**Verificar:**

- `.env` - Variables de desarrollo local
- `.env.example` - Template con todas las variables

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS (MCP)

**NO se requieren MCP para esta fase.**

### Herramientas Locales:

- Acceso a Vercel/Railway dashboard
- CLI del hosting provider (opcional)

---

## 🎯 OBJETIVO

Configurar environment variables en:

**Incluye:**

- ✅ **Development:** Variables en `.env` para local dev
- ✅ **Staging:** Variables en Vercel/Railway para staging environment
- ✅ **Production:** (Placeholder para Fase 12) Estructura preparada
- ✅ Validar que no hay secrets hardcodeados en código

**NO incluye:**

- ❌ Configurar production environment completo (eso es Fase 12)
- ❌ Secrets de terceros no configurados aún (se agregan cuando se integran)

**Resultado:** Cada ambiente tiene sus propias variables configuradas correctamente.

---

## 📤 OUTPUT GENERADO

### Local (Development):

- ✅ `.env` - Variables completas para desarrollo local (gitignored)
- ✅ `.env.example` - Actualizado con todas las variables necesarias

### Staging (Vercel/Railway):

- ✅ Environment variables configuradas en plataforma con scope "Preview"
- ✅ Variables apuntando a servicios de staging (Supabase staging, etc.)

### Documentation:

- ✅ `.context/environment-variables.md` - Documentación de qué variables existen y para qué

---

## 🚨 RESTRICCIONES CRÍTICAS

### ❌ NO HACER:

- **NO hardcodear valores** - Usar variables de entorno
- **NO commitear secrets reales** - Solo .env.example
- **NO exponer service role keys** - Solo en server-side
- **NO usar mismos valores en todos los ambientes** - Cada ambiente separado
- **NO configurar production todavía** - Eso es Fase 12

### ✅ SÍ HACER:

- **Separar por ambiente** - Dev, staging, prod con valores diferentes
- **Documentar cada variable** - Explicar para qué sirve
- **Validar que funciona** - Probar build con variables de staging
- **Usar NEXT*PUBLIC* prefix** - Para variables que frontend necesita

---

## 🔄 WORKFLOW

---

## 📋 PASO 1: IDENTIFICAR VARIABLES NECESARIAS

**Leer `.env.example` y `.context/infrastructure-setup.md`**

**Clasificar variables en:**

1. **Supabase Variables:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)

2. **Vercel Variables:**
   - `NEXT_PUBLIC_APP_URL`

3. **Third-party APIs (si aplica):**
   - Stripe, SendGrid, etc.

**Output al usuario:**

```markdown
## 📊 Variables Identificadas

### Core Variables (Supabase):

- `NEXT_PUBLIC_SUPABASE_URL` - URL del proyecto Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon key pública
- `SUPABASE_SERVICE_ROLE_KEY` - Service role (server-only)

### App Variables:

- `NEXT_PUBLIC_APP_URL` - URL base de la aplicación

### Third-party (si aplica):

- [Listar según proyecto]

---

**Total:** [X] variables a configurar
```

---

## 🖥️ PASO 2: CONFIGURAR DEVELOPMENT (Local)

**Objetivo:** Asegurar que `.env` tiene todas las variables.

### Paso 2.1: Verificar .env Existente

```bash
ls -la | grep .env
```

**Si `.env` no existe:**

```bash
cp .env.example .env
```

### Paso 2.2: Poblar Valores de Development

**Instrucciones al usuario:**

````markdown
## 🔧 Configurar `.env` (Development)

### 1️⃣ Abre el archivo `.env`

### 2️⃣ Reemplaza los placeholders con valores reales:

```env
# =============================================================================
# Supabase (Development)
# =============================================================================
NEXT_PUBLIC_SUPABASE_URL=https://[project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# ⚠️ NUNCA commitear este archivo - está en .gitignore
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# =============================================================================
# App Configuration (Development)
# =============================================================================
NEXT_PUBLIC_APP_URL=http://localhost:3000

# =============================================================================
# Third-party Services (si aplica)
# =============================================================================
# STRIPE_SECRET_KEY=sk_test_...
# SENDGRID_API_KEY=SG...
```
````

### 3️⃣ Verificar

```bash
npm run dev
```

- ✅ App inicia sin errores de variables faltantes
- ✅ Conexión a Supabase funciona

````

---

## ☁️ PASO 3: CONFIGURAR STAGING (Vercel/Railway)

**Objetivo:** Configurar variables en la plataforma de hosting para staging.

### Paso 3.1: Acceder a Dashboard

**Para Vercel:**

```markdown
## 🚀 Configurar Variables en Vercel (Staging)

### 1️⃣ Accede al proyecto:

https://vercel.com/[org]/[project]/settings/environment-variables

### 2️⃣ Para cada variable, agregar con Scope "Preview":

| Variable Name                   | Value                                 | Environment |
| ------------------------------- | ------------------------------------- | ----------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | https://[staging-project].supabase.co | Preview     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | eyJhbGc...                            | Preview     |
| `SUPABASE_SERVICE_ROLE_KEY`     | eyJhbGc...                            | Preview     |
| `NEXT_PUBLIC_APP_URL`           | https://[project]-develop.vercel.app  | Preview     |

**⚠️ IMPORTANTE:**

- **Scope "Preview"** = Solo para staging (develop branch)
- **Scope "Production"** = Configurar en Fase 12
- **Encrypted** = Vercel encripta automáticamente los valores

### 3️⃣ Click "Save" después de cada variable
````

**Para Railway (alternativa):**

```markdown
## 🚂 Configurar Variables en Railway (Staging)

### 1️⃣ Accede al proyecto:

https://railway.app/project/[project-id]/settings

### 2️⃣ En "Environment", selecciona el ambiente "staging"

### 3️⃣ Agregar cada variable:

Click en "New Variable" y agrega:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

### 4️⃣ Deploy nuevamente para aplicar cambios
```

---

## 📋 PASO 4: PREPARAR STRUCTURE PARA PRODUCTION

**Objetivo:** Documentar qué variables production necesitará (sin configurarlas todavía).

**Crear archivo:** `.context/environment-variables.md`

**Contenido:**

````markdown
# Environment Variables - [Proyecto]

## Variables por Ambiente

### Development (Local)

**Archivo:** `.env` (gitignored)

| Variable                        | Descripción                    | Ejemplo                 |
| ------------------------------- | ------------------------------ | ----------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL del proyecto Supabase dev  | https://xxx.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key pública de Supabase   | eyJhbGc...              |
| `SUPABASE_SERVICE_ROLE_KEY`     | Service role key (server-only) | eyJhbGc...              |
| `NEXT_PUBLIC_APP_URL`           | URL base de la app             | http://localhost:3000   |

---

### Staging (Vercel Preview)

**Platform:** Vercel Dashboard → Settings → Environment Variables

**Scope:** Preview (solo deploy de `develop` branch)

| Variable                        | Valor                                 | Notas                           |
| ------------------------------- | ------------------------------------- | ------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | https://[staging-project].supabase.co | Proyecto de staging en Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | [anon key staging]                    | Diferente de production         |
| `SUPABASE_SERVICE_ROLE_KEY`     | [service key staging]                 | Solo server-side                |
| `NEXT_PUBLIC_APP_URL`           | https://[project]-develop.vercel.app  | URL auto-generada por Vercel    |

---

### Production (Configurar en Fase 12)

**Platform:** Vercel Dashboard → Settings → Environment Variables

**Scope:** Production (solo deploy de `main` branch)

| Variable                        | Valor                              | Notas                    |
| ------------------------------- | ---------------------------------- | ------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | https://[prod-project].supabase.co | ⚠️ Configurar en Fase 12 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | [anon key production]              | ⚠️ Configurar en Fase 12 |
| `SUPABASE_SERVICE_ROLE_KEY`     | [service key production]           | ⚠️ Configurar en Fase 12 |
| `NEXT_PUBLIC_APP_URL`           | https://[domain].com               | ⚠️ Configurar en Fase 12 |

---

## Cómo Agregar Nueva Variable

### 1️⃣ Agregar a `.env.example`:

```env
# Nueva variable
NEW_VAR=valor-de-ejemplo
```
````

### 2️⃣ Agregar a `.env` (local dev):

```env
NEW_VAR=valor-real-dev
```

### 3️⃣ Agregar a Vercel (staging):

1. Vercel Dashboard → Settings → Environment Variables
2. Add variable con scope "Preview"

### 4️⃣ Documentar aquí:

Agregar fila a tabla correspondiente explicando para qué sirve.

---

## ⚠️ Security Best Practices

### Variables Públicas (NEXT*PUBLIC*)

- ✅ Expuestas en frontend (browser)
- ✅ Ejemplo: URLs públicas, anon keys
- ❌ NUNCA service role keys o API secrets

### Variables Privadas (Server-only)

- ✅ Solo accesibles en server-side (API routes, server components)
- ✅ Ejemplo: service role keys, API secrets
- ❌ NUNCA usar en componentes client

### .gitignore

```
.env
.env*.local
.env.production.local
```

### Rotation

- Rotar service role keys cada 90 días
- Si compromiso de secret → regenerar inmediatamente

````

---

## ✅ PASO 5: VALIDAR CONFIGURACIÓN

### Paso 5.1: Validar Local

```bash
# Iniciar dev server
npm run dev

# Verificar:
# ✅ No hay errores de variables faltantes
# ✅ Supabase connection funciona
# ✅ Auth flow funciona
````

### Paso 5.2: Validar Staging

**Trigger deploy a staging:**

```bash
git checkout develop
git commit --allow-empty -m "test: trigger staging deploy to validate env vars"
git push origin develop
```

**Verificar en Vercel Dashboard:**

- ✅ Build success
- ✅ Deployment success
- ✅ Abrir URL de staging y probar auth/DB

**Checklist:**

- [ ] Staging URL abre correctamente
- [ ] No hay errores en browser console relacionados con env vars
- [ ] Auth flow funciona (signup/login)
- [ ] Queries a DB funcionan

---

## 🎉 REPORTE FINAL

```markdown
# ✅ ENVIRONMENT CONFIGURATION COMPLETADO

## Ambientes Configurados:

### ✅ Development (Local)

- `.env` configurado con valores de development
- Variables validadas localmente

### ✅ Staging (Vercel Preview)

- [x] variables configuradas en Vercel con scope "Preview"
- Deploy de staging validado
- URL: https://[project]-develop.vercel.app

### ⏭️ Production (Fase 12)

- Estructura documentada
- Variables placeholder en `.context/environment-variables.md`

## Documentación Creada:

- ✅ `.context/environment-variables.md` - Guía completa de env vars

## Próximos Pasos:

1. ✅ Environment variables configuradas
2. ⏭️ Ejecutar `deploy-to-staging.md` para deploy inicial
3. ⏭️ Fase 10: Exploratory Testing en staging

---

**🎊 Ambientes configurados correctamente!**

Cada ambiente tiene sus propias variables sin crossover.
```

---

## 📋 CHECKLIST INTERNO (NO MOSTRAR)

### Identificación:

- [ ] Todas las variables identificadas desde .env.example
- [ ] Variables clasificadas (public vs private)

### Development:

- [ ] `.env` existe y está completo
- [ ] Variables validadas localmente

### Staging:

- [ ] Variables configuradas en hosting platform
- [ ] Scope correcto (Preview/Staging)
- [ ] Deploy de staging exitoso

### Documentación:

- [ ] `.context/environment-variables.md` creado
- [ ] Tabla de variables completa
- [ ] Security best practices incluidas

---

## 💡 MEJORES PRÁCTICAS

### **1. NEXT*PUBLIC* Prefix**

```bash
# ✅ Variable expuesta en frontend
NEXT_PUBLIC_API_URL=https://api.example.com

# ❌ Variable privada (NO usar NEXT_PUBLIC_)
API_SECRET_KEY=secret123
```

### **2. Diferentes Valores por Ambiente**

```
Development:  NEXT_PUBLIC_APP_URL=http://localhost:3000
Staging:      NEXT_PUBLIC_APP_URL=https://[project]-develop.vercel.app
Production:   NEXT_PUBLIC_APP_URL=https://[domain].com
```

### **3. Vercel Scopes**

- **Preview:** Solo deploys de branches no-main
- **Production:** Solo deploys de main branch
- **Development:** No aplica (local .env)

---

## 📚 REFERENCIAS

**Vercel Environment Variables:**

- https://vercel.com/docs/projects/environment-variables

**Next.js Environment Variables:**

- https://nextjs.org/docs/app/building-your-application/configuring/environment-variables

**Security Best Practices:**

- https://12factor.net/config

---

**✅ Environment Variables = Configuración separada por ambiente + Security**
