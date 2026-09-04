Actúa como Senior Full-Stack Developer y DevOps Engineer.

---

## 🎯 TAREA

**🔧 FEATURE: Environment URLs Setup (Fase 3 - Infrastructure)**

Crear un sistema **centralizado de URLs por ambiente** que detecte automáticamente el entorno (development, staging, production) y proporcione la URL base correcta.

---

## 📥 INPUT REQUERIDO

### 1. Contexto del Proyecto

**Leer estos archivos:**

- `package.json` - Nombre del proyecto
- `AGENTS.md` - Configuración de Vercel/ambientes existente
- `.env.example` - Variables de entorno actuales
- `src/lib/config.ts` - Configuración existente (si existe)

### 2. Información del Usuario

**Preguntar al usuario:**

```
Para configurar las URLs de tu proyecto, necesito conocer:

1. ¿Cuál es la URL de STAGING? (ej: https://staging-miproyecto.vercel.app)
2. ¿Cuál es la URL de PRODUCTION? (ej: https://miproyecto.vercel.app)
3. ¿Usas Vercel para deployments? (sí/no)
```

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS

### Precondiciones:

- ✅ Proyecto Next.js configurado
- ✅ (Opcional) Vercel configurado para deployments

### No requiere MCP especiales.

---

## 📤 OUTPUT GENERADO

### Archivos:

- ✅ `src/lib/urls.ts` - Helper centralizado de URLs
- ✅ `.env.example` - Actualizado con documentación
- ✅ `AGENTS.md` - Sección de URLs documentada

### Funciones Exportadas:

```typescript
APP_URLS; // Constante con todas las URLs
getEnvironment(); // Detecta ambiente actual
getBaseUrl(); // Retorna URL base del ambiente
buildUrl(path); // Construye URL completa
```

---

## 🛠️ PASOS DETALLADOS

### FASE 0: Recopilar Información

**Paso 0.1: Detectar configuración existente**

```bash
# Verificar si ya existe urls.ts
ls -la src/lib/urls.ts 2>/dev/null && echo "Ya existe" || echo "No existe"

# Verificar AGENTS.md para URLs documentadas
grep -i "staging\|production\|vercel" AGENTS.md 2>/dev/null || echo "No documentado"
```

**Paso 0.2: Obtener URLs del usuario**

Si no están documentadas, preguntar:

```
Necesito las URLs de tu proyecto:

1. URL de Staging: _______________
   (ej: https://staging-miapp.vercel.app)

2. URL de Production: _______________
   (ej: https://miapp.vercel.app)

3. ¿Tu proyecto usa Vercel? (sí/no): ___
```

**Guardar respuestas para usar en el código.**

---

### FASE 1: Crear src/lib/urls.ts

**Paso 1.1: Crear archivo**

Crear `src/lib/urls.ts` con el siguiente contenido:

````typescript
// src/lib/urls.ts

/**
 * URLs oficiales de la aplicación por ambiente
 * Fuente única de verdad para todos los redirects y links
 *
 * Ambientes:
 * - development: localhost:3000 (servidor local)
 * - staging: rama 'staging' en Vercel (custom environment tipo preview)
 * - production: rama 'main' en Vercel
 */
export const APP_URLS = {
  development: 'http://localhost:3000',
  staging: '[STAGING_URL]', // Reemplazar con URL real
  production: '[PRODUCTION_URL]', // Reemplazar con URL real
} as const;

export type AppEnvironment = keyof typeof APP_URLS;

/**
 * Detecta el ambiente actual basándose en variables de Vercel/Node
 *
 * - VERCEL_ENV='production' → production
 * - VERCEL_ENV='preview' → staging (nuestro custom environment)
 * - Sin VERCEL_ENV → development (local)
 */
export function getEnvironment(): AppEnvironment {
  if (process.env.VERCEL_ENV === 'production') {
    return 'production';
  }

  if (process.env.VERCEL_ENV === 'preview') {
    return 'staging';
  }

  return 'development';
}

/**
 * Retorna la URL base de la aplicación para el ambiente actual
 *
 * Uso:
 * ```ts
 * const baseUrl = getBaseUrl()
 * // development: 'http://localhost:3000'
 * // staging: '[STAGING_URL]'
 * // production: '[PRODUCTION_URL]'
 * ```
 */
export function getBaseUrl(): string {
  const env = getEnvironment();
  return APP_URLS[env];
}

/**
 * Construye una URL completa a partir de un path
 *
 * Uso:
 * ```ts
 * buildUrl('/dashboard/settings')
 * // → '[PRODUCTION_URL]/dashboard/settings' (en production)
 * ```
 */
export function buildUrl(path: string): string {
  const baseUrl = getBaseUrl();
  // Asegurar que el path empiece con /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
````

**Paso 1.2: Reemplazar placeholders**

Reemplazar `[STAGING_URL]` y `[PRODUCTION_URL]` con los valores reales proporcionados por el usuario.

---

### FASE 2: Actualizar Documentación

**Paso 2.1: Actualizar .env.example**

Agregar sección de URLs al final de `.env.example`:

```env
# =============================================================================
# Environment URLs (Informativo - NO son variables de entorno)
# =============================================================================
# Las URLs se gestionan en src/lib/urls.ts
#
# Ambientes configurados:
# - Development: http://localhost:3000
# - Staging: [STAGING_URL]
# - Production: [PRODUCTION_URL]
#
# Uso en código:
# import { getBaseUrl, buildUrl } from '@/lib/urls'
# const url = getBaseUrl()  // Retorna URL según ambiente
# =============================================================================
```

**Paso 2.2: Actualizar AGENTS.md**

Buscar sección "Vercel" o "Environments" en AGENTS.md y actualizar/agregar:

````markdown
## Vercel Environments Configuration

This project uses the following Vercel environment structure:

| Environment | Branch    | URL                     | VERCEL_ENV   | Usage                       |
| ----------- | --------- | ----------------------- | ------------ | --------------------------- |
| Development | N/A       | `http://localhost:3000` | N/A          | Local development           |
| **staging** | `staging` | `[STAGING_URL]`         | `preview`    | Primary development/testing |
| Production  | `main`    | `[PRODUCTION_URL]`      | `production` | Live production             |

### URL Helper (`src/lib/urls.ts`)

For redirects and links that need the base URL, **always use the centralized helper**:

```typescript
import { getBaseUrl, buildUrl } from '@/lib/urls';

// Returns the correct URL based on environment
const baseUrl = getBaseUrl();

// Build a complete URL
const dashboardUrl = buildUrl('/dashboard');
```
````

**NEVER hardcode URLs** - always use the helper functions.

````

---

### FASE 3: Validación

**Paso 3.1: TypeScript Check**

```bash
bun run typecheck
````

**Si hay errores:**

- Verificar que el path alias `@/lib/urls` está configurado en `tsconfig.json`
- Verificar sintaxis del archivo

**Paso 3.2: Verificar exportaciones**

```bash
# Verificar que el archivo exporta las funciones esperadas
grep "export" src/lib/urls.ts
```

**Output esperado:**

```
export const APP_URLS
export type AppEnvironment
export function getEnvironment
export function getBaseUrl
export function buildUrl
```

**Paso 3.3: Test manual (opcional)**

```typescript
// Puedes probar en un componente temporalmente:
import { getEnvironment, getBaseUrl, buildUrl } from '@/lib/urls';

console.log('Environment:', getEnvironment());
console.log('Base URL:', getBaseUrl());
console.log('Dashboard URL:', buildUrl('/dashboard'));
```

---

## 📋 CHECKLIST FINAL

### Archivos:

- [ ] `src/lib/urls.ts` creado con URLs correctas
- [ ] `.env.example` actualizado con documentación
- [ ] `AGENTS.md` actualizado con tabla de ambientes

### Validaciones:

- [ ] `bun run typecheck` pasa sin errores
- [ ] URLs de staging y production son correctas
- [ ] Funciones exportadas correctamente

### Documentación:

- [ ] Desarrolladores saben usar `getBaseUrl()` y `buildUrl()`
- [ ] Está claro que NO se deben hardcodear URLs

---

## 🎉 REPORTE FINAL

````markdown
# ✅ Environment URLs Setup Completado

## Archivo Creado:

- `src/lib/urls.ts`

## URLs Configuradas:

| Ambiente    | URL                   |
| ----------- | --------------------- |
| Development | http://localhost:3000 |
| Staging     | [STAGING_URL]         |
| Production  | [PRODUCTION_URL]      |

## Funciones Disponibles:

```typescript
import { getBaseUrl, buildUrl, getEnvironment, APP_URLS } from '@/lib/urls';

// Obtener URL base del ambiente actual
const baseUrl = getBaseUrl();

// Construir URL completa
const loginUrl = buildUrl('/login');

// Obtener nombre del ambiente
const env = getEnvironment(); // 'development' | 'staging' | 'production'

// Acceder a URLs específicas
const stagingUrl = APP_URLS.staging;
```
````

## Uso Recomendado:

```typescript
// ✅ Correcto - usar helper
import { buildUrl } from '@/lib/urls';
const redirectUrl = buildUrl('/auth/callback');

// ❌ Incorrecto - hardcodear URL
const redirectUrl = 'https://miapp.vercel.app/auth/callback';
```

## Documentación Actualizada:

- `.env.example` - Referencia de URLs
- `AGENTS.md` - Tabla de ambientes

````

---

## ❓ PREGUNTAS FRECUENTES

**P: ¿Por qué no usar variables de entorno para las URLs?**
R: Las URLs son constantes conocidas. Usar variables de entorno agrega complejidad innecesaria y riesgo de errores de configuración.

**P: ¿Qué es VERCEL_ENV?**
R: Variable automática de Vercel que indica el ambiente:
- `production` para rama main
- `preview` para otras ramas (incluyendo staging)
- No existe en desarrollo local

**P: ¿Puedo agregar más ambientes?**
R: Sí, modifica `APP_URLS` y `getEnvironment()`. Por ejemplo, para QA:
```typescript
export const APP_URLS = {
  development: '...',
  qa: 'https://qa-miapp.vercel.app',
  staging: '...',
  production: '...',
}
````

**P: ¿Funciona en Server Components?**
R: Sí, `process.env.VERCEL_ENV` está disponible tanto en server como client (es variable de sistema, no `.env`).

---

## 🔗 INTEGRACIÓN CON OTROS FEATURES

### Con Supabase Auth Redirects:

```typescript
import { buildUrl } from '@/lib/urls';

// En login/signup
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: buildUrl('/auth/callback'),
  },
});
```

### Con Email Templates:

```typescript
import { buildUrl } from '@/lib/urls';

// En templates de email
const confirmUrl = buildUrl(`/confirm?token=${token}`);
```

### Con OpenAPI Registry:

```typescript
import { APP_URLS } from '@/lib/urls';

// En registry.ts
servers: [
  { url: `${APP_URLS.development}/api`, description: 'Development' },
  { url: `${APP_URLS.staging}/api`, description: 'Staging' },
  { url: `${APP_URLS.production}/api`, description: 'Production' },
];
```
