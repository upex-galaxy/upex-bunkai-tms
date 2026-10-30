Actúa como Senior Backend Developer, API Security Expert, y Next.js Expert.

---

## 🎯 TAREA

**🔧 FEATURE: Bearer Token Support for API Routes (Fase 3 - Infrastructure)**

Agregar soporte de **autenticación Bearer Token** a las API routes de Next.js para permitir:

- Testing de APIs desde Postman, Insomnia, curl
- Integración con clientes externos (mobile apps, third-party services)
- Compatibilidad con flujos de autenticación estándar OAuth/JWT

**Mantiene compatibilidad** con la autenticación por cookies existente (browser).

---

## 🧭 PASO PREVIO: LEER EL BLOQUE `stack:`

Esta add-on corre igual en un proyecto greenfield y en una app existente (veredicto `existing-app` del guard de entrada, `SKILL.md` → Phase 3). Antes del primer paso, leer `.agents/project.yaml` → `stack:` (contrato: `.agents/README.md` → `stack`) y resolver con él todo lo que esta referencia escribe como literal:

- Las rutas de ejemplo (`src/app/api/`, `src/lib/supabase/`, `src/types/supabase.ts`) son el default greenfield: se resuelven bajo `{{stack.app_root}}`; el archivo de tipos es `{{stack.database.types_path}}`; con `stack.framework: nextjs-pages` la API vive en `pages/api/`.
- Los comandos de la app son `{{stack.package_manager}} run <script>` con el NOMBRE de `stack.scripts`; un script en `null` se salta y se dice, nunca se inventa. Las dependencias se instalan con ese package manager, sin cambiarlo.
- Lo que la app ya tiene gana: una UI de docs, un contrato de error, un esquema de auth, la ubicación de los Supabase clients o la versión mayor de una dependencia (Zod, Next) se leen y se extienden, nunca se reemplazan ni se actualizan desde esta add-on. Un choque se le muestra al usuario con las dos formas.
- El Supabase project ref es `environments.<env>.db_project_ref`; todo toque a la base sigue `agentic-dev-core/references/db-change-doctrine.md`.

---

## 📥 INPUT REQUERIDO

### 1. Contexto del Proyecto

**Leer estos archivos:**

- `.agents/project.yaml` → `environments.<env>.db_project_ref` (`{{DB_PROJECT_REF}}` del ambiente activo) - Supabase project ref; stack en `.context/SRS/architecture-specs.md`
- `src/lib/supabase/server.ts` - Server client actual
- `src/app/api/` - Endpoints existentes
- `src/lib/config.ts` - Configuración de Supabase

### 2. Información a Extraer

- **Supabase URL** → Para crear cliente con token
- **Publishable Key** → Para autenticación
- **Endpoints existentes** → Para actualizarlos

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS

### MCP Requeridos:

1. **MCP Context7** - Para verificar APIs de Supabase/Next.js

### Dependencias Requeridas (verificar):

- `@supabase/supabase-js` - Para crear cliente con token
- `@supabase/ssr` - Para cliente SSR existente

---

## 🔀 DETECCIÓN DE MODO

**Ejecutar análisis para determinar estado actual:**

```bash
# Verificar si ya existe soporte Bearer Token
grep -r "createServerFromRequest\|Authorization.*Bearer" src/lib/supabase/ src/app/api/ 2>/dev/null

# Contar endpoints que usan createServer
grep -r "createServer()" src/app/api/ --include="*.ts" | wc -l

# Verificar estructura de server.ts
cat src/lib/supabase/server.ts | head -20
```

**Resultado:**

| Condición                              | Modo                |
| -------------------------------------- | ------------------- |
| Ya existe `createServerFromRequest`    | **YA IMPLEMENTADO** |
| Solo existe `createServer` (cookies)   | **IMPLEMENTAR**     |
| No existe `src/lib/supabase/server.ts` | **CREAR TODO**      |

---

## 📤 OUTPUT GENERADO

### Archivos Modificados/Creados:

**Core (`src/lib/supabase/`):**

- ✅ `server.ts` - Agregar `createServerFromRequest()` con soporte dual

**Auth helper compartido (si existe, de `api-routes-setup`):**

- ✅ `src/lib/api/auth.ts` (`getAuthenticatedUser`/`requireAuth`) actualizado para recibir `request` y usar `createServerFromRequest`

**API Routes (`src/app/api/`):**

- ✅ Todos los endpoints protegidos actualizados para usar `createServerFromRequest` (o el helper actualizado), pasando `request`

**Documentación (si existe OpenAPI / `/api/docs`):**

- ✅ `securitySchemes` Bearer registrado en `src/lib/openapi/registry.ts` + documentado en `info.description` (Scalar lo renderiza en `/api/docs`)

---

## 🛠️ PASOS DETALLADOS

### FASE 0: Análisis del Proyecto

**Paso 0.1: Verificar estado actual**

```bash
# Verificar si ya existe soporte
grep -l "createServerFromRequest" src/lib/supabase/server.ts 2>/dev/null && echo "✅ Ya tiene soporte" || echo "❌ Necesita implementación"
```

**Paso 0.2: Listar endpoints a actualizar**

```bash
# Encontrar todos los endpoints que usan createServer
grep -rl "await createServer()" src/app/api/ --include="*.ts"
```

**Paso 0.3: Verificar configuración de Supabase**

```bash
# Verificar que existen las variables necesarias
cat src/lib/config.ts | grep -E "supabaseUrl|supabaseAnonKey"
```

---

### FASE 1: Modificar `server.ts`

**Paso 1.1: Agregar import de `createClient`**

Si no existe, agregar al inicio del archivo:

```typescript
import { createClient } from '@supabase/supabase-js';
```

**Paso 1.2: Agregar función `createServerFromRequest`**

Agregar después de la función `createServer()` existente:

```typescript
/**
 * Creates a Supabase client from a Request object, supporting both:
 * - Bearer token authentication (Authorization header)
 * - Cookie-based authentication (default SSR behavior)
 *
 * This is useful for API routes that need to support external clients
 * (Postman, mobile apps, third-party integrations) via Bearer tokens,
 * while still working with browser requests that use cookies.
 *
 * @example
 * // Route Handler with dual auth support
 * import { createServerFromRequest } from '@/lib/supabase/server'
 *
 * export async function GET(request: Request) {
 *   const supabase = await createServerFromRequest(request)
 *   const { data: { user } } = await supabase.auth.getUser()
 *   // ...
 * }
 *
 * @example
 * // Postman request with Bearer token
 * // GET /api/clients
 * // Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
 */
export async function createServerFromRequest(request: Request) {
  const authHeader = request.headers.get('Authorization');

  // If Bearer token is provided, use it directly
  if (authHeader?.startsWith('Bearer ')) {
    const accessToken = authHeader.slice(7); // Remove "Bearer " prefix

    return createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  // Fallback to cookie-based authentication
  return createServer();
}
```

**IMPORTANTE:** Asegurarse de que:

- `Database` type está importado de `@/types/supabase`
- `supabaseUrl` y `supabaseAnonKey` están disponibles desde config

---

### FASE 2: Actualizar API Routes

**Paso 2.1: Identificar patrón de actualización**

Por cada endpoint protegido, cambiar:

```typescript
// ANTES
import { createServer } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServer();
  // ...
}

// DESPUÉS
import { createServerFromRequest } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createServerFromRequest(request);
  // ...
}
```

**Paso 2.2: Casos especiales**

Para handlers que ignoraban el request (`_request`):

```typescript
// ANTES
export async function GET(_request: Request) {
  const supabase = await createServer();

// DESPUÉS
export async function GET(request: Request) {
  const supabase = await createServerFromRequest(request);
```

Para handlers con `context` (rutas dinámicas):

```typescript
// ANTES
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createServer();

// DESPUÉS
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerFromRequest(request);
```

**Paso 2.3: NO actualizar endpoints públicos**

Endpoints que NO requieren autenticación NO necesitan cambios:

- `/api/health` - Health check público
- `/api/openapi` - Spec OpenAPI público
- `/api/auth/forgot-password` - Flujo de reset password

**Paso 2.4: Actualizar el helper de auth compartido (si existe `src/lib/api/auth.ts`)**

> **CRÍTICO**: si `api-routes-setup` creó `src/lib/api/auth.ts`, los endpoints suelen autenticar vía `getAuthenticatedUser()` / `requireAuth()`, NO llamando `createServer()` directo. Si solo actualizás los `route.ts` pero el helper sigue usando `createServer()` (cookie), el Bearer **no funcionará** en ningún endpoint que use el helper. Actualizá el helper para que acepte el `request` y use `createServerFromRequest`:

```typescript
// src/lib/api/auth.ts (ACTUALIZADO para soporte dual cookie + Bearer)
import { createServerFromRequest } from '@/lib/supabase/server';
import { unauthorizedError } from './responses';

// Pasar SIEMPRE el request: createServerFromRequest lee Authorization: Bearer
// y cae a cookies si no hay header.
export async function getAuthenticatedUser(request: Request) {
  const supabase = await createServerFromRequest(request);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, error: unauthorizedError() };
  }
  return { user, error: null };
}

export async function requireAuth(request: Request) {
  const { user, error } = await getAuthenticatedUser(request);
  if (error) throw error;
  return user!;
}
```

Y en cada endpoint que lo use, pasar el `request`:

```typescript
// ANTES:  const { user, error } = await getAuthenticatedUser();
// DESPUÉS:
export async function GET(request: Request) {
  const { user, error } = await getAuthenticatedUser(request);
  // ...
}
```

---

### FASE 3: (Opcional) Actualizar Documentación

**Solo si existe OpenAPI (`src/lib/openapi/registry.ts`).** Scalar (`/api/docs`) renderiza la auth desde el spec — no hay panel React que editar.

**Paso 3.1: Verificar existencia**

```bash
ls src/lib/openapi/registry.ts 2>/dev/null
```

**Paso 3.2: Registrar el `securitySchemes` Bearer + documentar en `info.description`**

En `src/lib/openapi/registry.ts`:

1. **Registrar el scheme Bearer** (si no existe ya un `bearerAuth`):

```typescript
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Supabase access_token (JWT). Obtené uno vía POST /auth/v1/token?grant_type=password y mandalo como Authorization: Bearer <token>.',
});
```

2. **Aplicar `security: [{ bearerAuth: [] }]`** en los `registry.registerPath()` de los endpoints protegidos.

3. **Documentar el flujo en `info.description`** del `generateOpenAPIDocument()` (login Supabase → `access_token` → header `Authorization: Bearer`, expiración, renovación). Scalar lo muestra arriba en `/api/docs` con ejemplos copiables nativos (incluido "Test Request").

> No se crea ni edita ningún componente React: la doc vive 100% en el spec (single source of truth) y la UI la provee Scalar.

---

### FASE 3.5: Rate limiting + rotación de secretos (OBLIGATORIA, B7)

Bearer auth abre las API routes a clientes fuera del browser (scripts, Postman, integraciones). Sin límite de tasa ni plan de rotación el feature queda a medias (SKILL.md, anti-pattern **B7**), así que ambos se entregan en el mismo scaffold.

**Paso 3.5.1: Rate limiting en las rutas protegidas**

**Pseudocódigo (verificar la API con Context7 antes de escribir código):**

```
1. Preguntar al usuario dónde vive el límite:
   a) En la plataforma (reglas de firewall / rate limit del hosting, ej. Vercel Firewall)
   b) En código (helper `rateLimit(request)` con un store compartido, ej. Redis)
   NO usar un contador en memoria: cada instancia serverless tiene el suyo.

2. Clave del límite: user_id del token cuando existe, IP como fallback.

3. Aplicarlo en las rutas que aceptan Bearer y en el login proxy si existe.

4. Respuesta al exceder: 429 Too Many Requests + header Retry-After,
   con el mismo formato de error que el resto de la API.

5. Valores (requests por ventana) en `.env` / config, nunca hardcodeados (B4).
```

**Paso 3.5.2: Guía de rotación de secretos**

Documentar en `.context/api-auth.md` (o en `info.description` si hay OpenAPI) cómo se rota cada secreto que este feature toca:

- **`SUPABASE_SECRET_KEY`** (y cualquier API key propia, ej. `X-API-Key`): generar la nueva en el dashboard de Supabase, actualizar `.env` y los scopes de Vercel (`/vercel-cli`, sync de env vars), redeploy, revocar la anterior.
- **Claves de firma de JWT de Supabase**: rotarlas desde el dashboard; los tokens emitidos con la clave anterior dejan de validar, así que avisar a los clientes externos.
- **Tokens de usuario**: vida corta del `access_token`, renovación con `refresh_token`, y `signOut` global para invalidar las sesiones de un usuario comprometido.
- **Cuándo rotar**: ante un secreto expuesto (log, commit, captura), al salir alguien con acceso, y con la frecuencia que fije el equipo.

---

### FASE 4: Validación

**Paso 4.1: TypeScript check**

```bash
bun run types:check
```

**Paso 4.2: Lint check**

```bash
bun run lint:check
```

**Paso 4.3: Test manual (opcional)**

```bash
# 1. Obtener token
curl -X POST "https://[PROJECT_ID].supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: [PUBLISHABLE_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# 2. Usar token
curl "http://localhost:3000/api/[endpoint]" \
  -H "Authorization: Bearer [ACCESS_TOKEN]"
```

---

## 📋 CHECKLIST FINAL

### Implementación Core:

- [ ] `createServerFromRequest()` agregado a `server.ts`
- [ ] Import de `createClient` agregado
- [ ] Tipos correctamente referenciados

### API Routes:

- [ ] Todos los endpoints protegidos actualizados
- [ ] Import cambiado de `createServer` a `createServerFromRequest`
- [ ] Parámetro `request` usado (no `_request`)
- [ ] (Si existe) `src/lib/api/auth.ts` actualizado a `createServerFromRequest` y recibe `request`
- [ ] Endpoints que usan el helper pasan `request` a `getAuthenticatedUser(request)` / `requireAuth(request)`

### Rate limiting + rotación (B7):

- [ ] Rate limiting aplicado a las rutas con Bearer (store compartido o plataforma, nunca en memoria)
- [ ] Exceso devuelve 429 + `Retry-After`
- [ ] Guía de rotación de secretos documentada

### Validación:

- [ ] `bun run types:check` pasa
- [ ] `bun run lint:check` pasa sin nuevos errores
- [ ] Endpoints siguen funcionando con cookies (browser)
- [ ] Endpoints funcionan con Bearer token (Postman)

### Documentación (si aplica):

- [ ] `securitySchemes` Bearer registrado en `registry.ts` + aplicado en endpoints protegidos
- [ ] Flujo de Bearer Token documentado en `info.description`
- [ ] Guía de Bearer Token visible en `/api/docs` (Scalar)

---

## 🎉 REPORTE FINAL

```markdown
# ✅ Bearer Token Support Implementado

## Archivos Modificados:

### Core:

- src/lib/supabase/server.ts (nueva función createServerFromRequest)

### API Routes Actualizados:

[Listar todos los archivos modificados]

### Documentación:

- src/lib/openapi/registry.ts (securitySchemes `bearerAuth` + `info.description`, si existe OpenAPI)

## Cómo Usar:

### 1. Obtener Token:

POST https://[PROJECT_ID].supabase.co/auth/v1/token?grant_type=password
Headers:

- apikey: [PUBLISHABLE_KEY]
- Content-Type: application/json
  Body:
  {"email": "...", "password": "..."}

### 2. Usar Token:

GET /api/[endpoint]
Headers:

- Authorization: Bearer [access_token]

## Compatibilidad:

- ✅ Browser (cookies) - Sigue funcionando igual
- ✅ Postman (Bearer token) - Nuevo soporte
- ✅ Mobile apps (Bearer token) - Nuevo soporte
- ✅ Third-party integrations (Bearer token) - Nuevo soporte

## Notas:

- Token expira en 1 hora (3600 segundos)
- Múltiples tokens pueden coexistir
- Para renovar, usar refresh_token con grant_type=refresh_token
- Rate limit: [N] requests por [ventana], exceso → 429
- Rotación de secretos: ver `.context/api-auth.md`
```

---

## ❓ PREGUNTAS FRECUENTES

**P: ¿Esto rompe la autenticación existente por cookies?**
R: No. La función detecta si hay Bearer token; si no lo hay, usa cookies automáticamente.

**P: ¿Necesito modificar el middleware?**
R: No. El middleware sigue manejando la protección de páginas con cookies. Los API routes manejan su propia autenticación.

**P: ¿Funciona con Row Level Security (RLS)?**
R: Sí. El cliente creado con Bearer token tiene el mismo `user_id` que con cookies, y RLS se aplica igual.

**P: ¿Qué pasa si el token expira?**
R: El endpoint retorna 401 Unauthorized. El cliente debe obtener un nuevo token.

**P: ¿Puedo usar este token para el API de Supabase directamente?**
R: Sí. El mismo `access_token` funciona para:

- Next.js API routes (con Bearer header)
- Supabase REST API (con Authorization header + apikey)
- Supabase Realtime

**P: ¿Cómo obtengo el token sin usar la UI?**
R: POST a `/auth/v1/token?grant_type=password` con email/password. Ver sección de validación.

---

## 🔗 INTEGRACIÓN CON OTROS FEATURES

### Con `api-routes-setup`:

Este feature complementa `api-routes-setup`. Si ejecutas primero `api-routes-setup`, luego puedes ejecutar este para agregar Bearer token support.

### Con `openapi-setup`:

Si tienes OpenAPI + `/api/docs` (Scalar) configurado, este feature registra el `securitySchemes` Bearer en `registry.ts` y documenta el flujo en `info.description`; Scalar lo renderiza en `/api/docs`.

### Con `supabase-types-setup`:

Los tipos de `Database` deben estar disponibles en `@/types/supabase` para el typing correcto.

---

## 📝 NOTAS PARA LA IA

1. **Detectar estado actual** antes de modificar. Si ya existe `createServerFromRequest`, reportar que ya está implementado.

2. **No modificar endpoints públicos** como health checks o endpoints de autenticación que deben ser accesibles sin token.

3. **Preservar funcionalidad existente**. El fallback a cookies es crítico para que el browser siga funcionando.

4. **Documentar cambios**. Si existe OpenAPI/`/api/docs`, actualizar `securitySchemes` + `info.description` en `registry.ts` es parte del feature.

5. **Rate limiting y rotación no son opcionales** (B7). Si el usuario no elige dónde vive el límite, el feature no se da por terminado.

6. **Usar el request parameter**. Cambiar `_request` a `request` en los handlers es necesario para pasar el header.
