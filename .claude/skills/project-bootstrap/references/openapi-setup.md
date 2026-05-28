Actúa como Senior API Developer, Documentation Engineer, y Full-Stack Developer.

---

## 🎯 TAREA

**🔧 FEATURE: OpenAPI + Zod Setup (Fase 3 - Infrastructure)**

Configurar un sistema completo de **documentación de APIs** que incluye:

- Registry OpenAPI con Zod schemas
- Endpoint `/api/openapi` que genera spec JSON
- Ruta `/api/docs` con UI interactiva (**Scalar**, vía route handler)
- Métodos de autenticación documentados en el spec (`info.description` + `securitySchemes`), que Scalar renderiza nativamente

---

## 📥 INPUT REQUERIDO

### 1. Contexto del Proyecto

**Leer estos archivos:**

- `.context/PRD/executive-summary.md` - Nombre y descripción del proyecto
- `CLAUDE.md` - Configuración de Supabase Project ID
- `src/lib/config.ts` - Configuración existente
- `src/lib/urls.ts` - URLs por ambiente (si existe)
- `src/app/api/` - Endpoints existentes (si hay)
- `package.json` - Dependencias actuales

### 2. Información a Extraer

- **Nombre del proyecto** → Para título de la API
- **Supabase Project ID** → Para cookie name en auth
- **URLs de ambientes** → Para servers en OpenAPI spec

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS

### MCP Requeridos:

1. **MCP Context7** - Para verificar versiones de dependencias

### Dependencias a Instalar:

```bash
bun add @asteasolutions/zod-to-openapi zod
```

---

## 🔀 DETECCIÓN DE MODO

**Ejecutar análisis para determinar modo:**

```bash
# Verificar si existen endpoints custom
ls -la src/app/api/ 2>/dev/null | grep -v "openapi" | wc -l

# Verificar si ya existe estructura OpenAPI
ls -la src/lib/openapi/ 2>/dev/null
```

**Resultado:**

| Condición                                     | Modo         |
| --------------------------------------------- | ------------ |
| No existe `src/app/api/` o solo tiene openapi | **PARCIAL**  |
| Existen endpoints custom en `src/app/api/`    | **COMPLETO** |

### Modo PARCIAL:

- Crea estructura base de OpenAPI
- Endpoint `/api/openapi` funcional
- UI `/api/docs` (Scalar) con info genérica
- Sin schemas de dominio específicos

### Modo COMPLETO (adicional):

- Analiza endpoints existentes
- Crea schemas Zod por dominio
- Registra endpoints en OpenAPI
- Auth info panel contextualizado

---

## ⚠️ PATRÓN CRÍTICO: Single Source of Truth

> **IMPORTANTE:** Este patrón es OBLIGATORIO para evitar desincronización entre tipos y documentación OpenAPI.

### El Problema (Anti-patrón)

```
src/types/user.ts           →  Define tipos TypeScript
src/lib/openapi/schemas/users.ts  →  Define schemas Zod separados (¡DUPLICADO!)

Resultado: Al agregar un campo, debes actualizar AMBOS archivos.
           Si olvidas uno, la documentación queda desincronizada.
```

### La Solución (Patrón Correcto)

```
src/types/user.ts           →  Define schemas Zod con .openapi() + genera tipos
src/lib/openapi/schemas/users.ts  →  Solo importa y registra paths (NO define schemas)

Resultado: Cambiar types = automáticamente cambiar OpenAPI spec.
           IMPOSIBLE desincronizarse.
```

### Estructura de Archivos Correcta

```
src/types/                          ← FUENTE DE VERDAD (schemas Zod + tipos)
├── user.ts                         ← UserSchema.openapi('User') + type User
├── booking.ts                      ← BookingSchema.openapi('Booking') + type Booking
├── communication.ts                ← ChannelSchema.openapi('Channel') + type Channel
└── index.ts                        ← Barrel export

src/lib/openapi/
├── registry.ts                     ← Configuración central
├── index.ts                        ← Entry point
└── schemas/
    ├── common.ts                   ← Schemas genéricos (ErrorResponse, UUID, etc.)
    ├── users.ts                    ← Solo registry.registerPath(), importa de @/types
    ├── bookings.ts                 ← Solo registry.registerPath(), importa de @/types
    └── index.ts                    ← Barrel export
```

### Ejemplo Práctico

```typescript
// ✅ CORRECTO: src/types/communication.ts (FUENTE DE VERDAD)
import { z } from '@/lib/openapi/zod'; // instancia única extendida — NUNCA importar de 'zod' si usás .openapi()

// Schema con metadata OpenAPI
export const CommunicationChannelSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(['zoom', 'google_meet', 'phone', 'whatsapp']),
    handle: z.string().nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .openapi('CommunicationChannel');

// Tipo inferido AUTOMÁTICAMENTE (siempre sincronizado)
export type CommunicationChannel = z.infer<typeof CommunicationChannelSchema>;

// Schema para input (crear/actualizar)
export const ChannelInputSchema = CommunicationChannelSchema.omit({ id: true }).openapi(
  'ChannelInput'
);
export type ChannelInput = z.infer<typeof ChannelInputSchema>;

// Helper de validación para usar en API routes
export function isValidChannelType(type: string): boolean {
  return ['zoom', 'google_meet', 'phone', 'whatsapp'].includes(type);
}
```

```typescript
// ✅ CORRECTO: src/lib/openapi/schemas/users.ts (SOLO REGISTRA PATHS)
import { registry } from '../registry';
import { z } from '../zod'; // instancia única extendida
import { CommunicationChannelSchema, ChannelInputSchema } from '@/types/communication'; // ← IMPORTA de types, NO define aquí
import { ErrorResponseSchema } from './common';

// Solo registra el PATH, no define schemas nuevos
registry.registerPath({
  method: 'put',
  path: '/users/me/communication-channels',
  tags: ['Users'],
  summary: 'Update user communication channels',
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            channels: z.array(ChannelInputSchema), // ← USA schema importado
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Channels updated',
      content: {
        'application/json': {
          schema: z.object({
            channels: z.array(CommunicationChannelSchema), // ← USA schema importado
          }),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
```

```typescript
// ❌ INCORRECTO: NO hagas esto (duplicación)
// src/lib/openapi/schemas/users.ts
export const ChannelSchema = z
  .object({
    // ← DUPLICADO de src/types/communication.ts
    type: z.enum(['zoom', 'google_meet']),
    handle: z.string(),
  })
  .openapi('Channel');
```

### Beneficio

Al agregar un campo nuevo, solo editas UN archivo:

```typescript
// src/types/communication.ts - agregar campo "priority"
export const ChannelInputSchema = z.object({
  type: CommunicationChannelTypeSchema,
  handle: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  priority: z.number().optional().default(0).openapi({
    // ← NUEVO
    description: 'Display priority (higher = first)',
  }),
});

// Automáticamente:
// ✅ TypeScript types actualizados
// ✅ Validación en runtime actualizada
// ✅ OpenAPI spec actualizado
// ✅ Documentación en /api/docs actualizada
```

### Relación con los tipos generados de Supabase (`src/types/supabase.ts`)

Hay DOS familias de tipos en `src/types/` — no se pisan, pero hay que entender el límite:

| Familia | Origen | Naming | Rol |
| --- | --- | --- | --- |
| `Database` (`supabase.ts`) | generada por `supabase gen types` (supabase-types-setup) | **snake_case** (`user_id`, `created_at`) — refleja columnas DB | Verdad de la **fila de la DB** (queries del cliente Supabase) |
| Schemas Zod (`booking.ts`, etc.) | escritos a mano con `.openapi()` | normalmente **camelCase** (`userId`, `createdAt`) | Verdad del **contrato de la API** (validación + OpenAPI) |

**Regla:**

- El **payload de la API** (request/response) lo define el schema Zod en `src/types/` → fuente única del contrato + OpenAPI.
- La **fila de la DB** la define `Database` generado → fuente única del acceso a datos.
- El **route handler es el punto de mapeo**: valida con Zod, consulta con tipos `Database`, y mapea snake_case ↔ camelCase explícitamente. NO derives uno del otro a ciegas.
- Para evitar drift de naming, podés: (a) mantener el schema Zod en snake_case para igualar la DB (menos mapeo, contrato menos idiomático), o (b) camelCase en la API + una función de mapeo. Elegí UNA convención por proyecto y documentala.

---

## 📤 OUTPUT GENERADO

### Modo PARCIAL:

**Estructura OpenAPI (`src/lib/openapi/`):**

- ✅ `registry.ts` - Configuración central
- ✅ `index.ts` - Entry point
- ✅ `schemas/common.ts` - Schemas base
- ✅ `schemas/index.ts` - Barrel export

**Endpoint (`src/app/api/openapi/`):**

- ✅ `route.ts` - GET endpoint

**UI (`src/app/api/docs/`):**

- ✅ `route.ts` - Route handler de Scalar (un solo archivo; sirve la UI desde el spec)

> Scalar reemplaza la página + componentes bespoke de Redoc. El selector multi-spec y el panel de auth se obtienen de forma nativa (config `sources` + `info.description`/`securitySchemes` del spec) — no se generan componentes React aparte.

### Modo COMPLETO (adicional):

**Tipos de dominio (`src/types/`):** ← FUENTE DE VERDAD

- ✅ `[dominio].ts` - Zod schemas con `.openapi()` + tipos inferidos
- ✅ Helpers de validación para API routes

**Path registrations (`src/lib/openapi/schemas/`):**

- ✅ `[dominio].ts` - Solo `registry.registerPath()`, importa de `@/types`
- ✅ Endpoints registrados en registry
- ✅ Auth documentada en `info.description` + `securitySchemes` del registry (Scalar la renderiza en `/api/docs`)

> **Nota:** Los schemas de dominio viven en `src/types/`, NO en `src/lib/openapi/schemas/`

---

## 🛠️ PASOS DETALLADOS

### FASE 0: Análisis y Preparación

**Paso 0.1: Detectar modo**

```bash
# Contar endpoints (excluyendo openapi)
ENDPOINT_COUNT=$(find src/app/api -name "route.ts" 2>/dev/null | grep -v "openapi" | wc -l)

if [ "$ENDPOINT_COUNT" -gt "0" ]; then
  echo "Modo: COMPLETO ($ENDPOINT_COUNT endpoints encontrados)"
else
  echo "Modo: PARCIAL (sin endpoints custom)"
fi
```

**Paso 0.2: Extraer información del proyecto**

```bash
# Nombre del proyecto
grep -i "title\|name\|proyecto" .context/PRD/executive-summary.md | head -3

# Supabase Project ID
grep -i "project.*id\|supabase" CLAUDE.md | grep -E "[a-z]{20,}"
```

**Guardar:**

- `PROJECT_NAME` - Nombre para título de API
- `SUPABASE_PROJECT_ID` - Para cookie name (ej: `ionevzckjyxtpmyenbxc`)

**Paso 0.3: Verificar URLs**

```bash
# Si existe urls.ts, usarlo
cat src/lib/urls.ts 2>/dev/null | grep -E "staging|production"
```

Si no existe, preguntar al usuario por las URLs.

---

### FASE 1: Instalar Dependencias

**Paso 1.1: Verificar dependencias existentes**

```bash
grep -E "zod|openapi|@scalar" package.json
```

**Paso 1.2: Instalar (si necesario)**

```bash
# Consultar Context7 primero para versiones actuales.
# Generación del spec (UI-agnóstico) — Zod v4 + zod-to-openapi v8 (combinación oficial actual):
bun add zod@^4 @asteasolutions/zod-to-openapi@^8
# UI de documentación (Scalar, route handler para Next.js App Router):
bun add @scalar/nextjs-api-reference
```

> **Versiones (verificado)**: `@asteasolutions/zod-to-openapi` v8.x soporta **Zod 4.x**. Si el proyecto está pinneado a **Zod 3**, usar `@asteasolutions/zod-to-openapi@7.3.4` (la rama v3, ya sin soporte activo) y la sintaxis legacy `z.email()/.uuid()/.datetime()`. Este documento usa la sintaxis **Zod v4** (`z.email()`, `z.uuid()`, `z.iso.datetime()`, `error.issues`).
>
> **Peer compat Scalar**: `@scalar/nextjs-api-reference` actual soporta Next.js 15 (versiones <0.5 pinneaban `next@^14`). Si `bun add` reporta conflicto de peer, instalar `@latest` y confirmar la versión.

**Verificar instalación:**

```bash
bun pm ls | grep -E "zod|openapi|@scalar"
```

---

### FASE 2: Crear Estructura OpenAPI

**Paso 2.1: Crear directorio + instancia única de Zod**

```bash
mkdir -p src/lib/openapi/schemas
```

> **CRÍTICO (evita crash de `.openapi()` undefined)**: `extendZodWithOpenApi` muta el singleton de Zod. Si unos archivos importan `z` de `'zod'` y otros lo extienden por separado, un módulo que use `.openapi()` puede cargarse ANTES de que se ejecute `extendZodWithOpenApi` → `.openapi` es `undefined` en runtime. Solución: **UN** módulo que extiende y reexporta `z`, y **todo archivo que use `.openapi()` importa `z` desde aquí** (nunca de `'zod'`).

```typescript
// src/lib/openapi/zod.ts — instancia única de Zod extendida con OpenAPI.
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export { z };
```

**Paso 2.2: Crear `registry.ts`**

```typescript
// src/lib/openapi/registry.ts

/**
 * OpenAPI Registry Configuration
 *
 * Central configuration for generating OpenAPI documentation
 * from Zod schemas. This is the source of truth for the API spec.
 */

import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from './zod'; // instancia única ya extendida con .openapi()

// Create the registry instance
export const registry = new OpenAPIRegistry();

// ============================================================================
// Security Schemes
// ============================================================================

// Cookie-based authentication (Supabase session)
registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'sb-[SUPABASE_PROJECT_ID]-auth-token', // Reemplazar con ID real
  description: 'Supabase session cookie. Obtained automatically after login via the web app.',
});

// API Key authentication (for testing endpoints)
registry.registerComponent('securitySchemes', 'apiKeyAuth', {
  type: 'apiKey',
  in: 'header',
  name: 'X-API-Key',
  description: 'API key for testing endpoints. Use environment variable in testing.',
});

// Bearer token (for cron jobs)
registry.registerComponent('securitySchemes', 'cronAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'CRON_SECRET token for scheduled job endpoints.',
});

// ============================================================================
// OpenAPI Document Generator
// ============================================================================

export function generateOpenAPIDocument() {
  // 3.0.3 funciona con Scalar. Opcional: para OpenAPI 3.1 (más alineado con
  // JSON Schema / Zod v4) usar `OpenApiGeneratorV31` + `openapi: '3.1.0'`.
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: '[PROJECT_NAME] - API', // Reemplazar
      version: '1.0.0',
      description: `
## Custom API Endpoints

This documentation covers the custom Next.js API endpoints.

---

## Authentication Methods

### 1. Cookie Auth (Most Endpoints)
The primary authentication method uses **Supabase session cookies**.

**Cookie name:** \`sb-[SUPABASE_PROJECT_ID]-auth-token\`

**How to test:**
1. Login via the web app
2. Copy the auth cookie from DevTools
3. Add to your API requests

### 2. API Key Auth (Testing)
Some endpoints accept an API key header for testing.

**Header:** \`X-API-Key: [your-api-key]\`

### 3. Cron Auth (Scheduled Jobs)
Cron endpoints require Bearer token authorization.

**Header:** \`Authorization: Bearer CRON_SECRET\`

---

## Base URLs

Las URLs por ambiente se resuelven desde \`src/lib/urls.ts\` (env-url-setup) o \`.agents/project.yaml\` — NUNCA se hardcodean acá (anti-patrón B4).
      `.trim(),
      contact: {
        name: 'Development Team',
        url: '[REPO_URL]',
      },
    },
    // ANTI-PATRÓN B4: no hardcodear URLs ni placeholders. Derivar del entorno.
    // Preferido (si corriste env-url-setup): import { getBaseUrl } from '@/lib/urls'
    //   → url: `${getBaseUrl()}/api`
    // Fallback sin env-url-setup: leer de .agents/project.yaml / env.
    servers: [
      {
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api`,
        description: 'Current environment',
      },
    ],
    tags: [
      // Agregar tags según dominios del proyecto
      {
        name: 'System',
        description: 'System endpoints (health, openapi)',
      },
    ],
  });
}

// Re-export z with OpenAPI extensions
export { z };
```

**IMPORTANTE:** Reemplazar todos los placeholders:

- `[SUPABASE_PROJECT_ID]`
- `[PROJECT_NAME]`
- `[REPO_URL]`

**Paso 2.3: Crear `index.ts`**

```typescript
// src/lib/openapi/index.ts

export { registry, generateOpenAPIDocument, z } from './registry';
export * from './schemas';
```

**Paso 2.4: Crear `schemas/common.ts`**

```typescript
// src/lib/openapi/schemas/common.ts

/**
 * Common OpenAPI Schemas
 *
 * Reusable schemas for error responses, common types, etc.
 */

import { registry, z } from '../registry';

// ============================================================================
// Common Type Schemas
// ============================================================================

export const UUIDSchema = z.uuid().openapi({
  description: 'UUID v4 identifier',
  example: '550e8400-e29b-41d4-a716-446655440000',
});

export const TimestampSchema = z.iso.datetime().openapi({
  description: 'ISO 8601 timestamp',
  example: '2024-01-15T10:30:00Z',
});

export const EmailSchema = z.email().openapi({
  description: 'Email address',
  example: 'user@example.com',
});

// ============================================================================
// Error Response Schemas
// ============================================================================

export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({ description: 'Error message' }),
    details: z.string().optional().openapi({ description: 'Additional error details' }),
  })
  .openapi('ErrorResponse');

export const ValidationErrorSchema = z
  .object({
    error: z.string().openapi({ description: 'Validation error message' }),
    field: z.string().optional().openapi({ description: 'Field that failed validation' }),
  })
  .openapi('ValidationError');

// ============================================================================
// Success Response Schemas
// ============================================================================

export const SuccessResponseSchema = z
  .object({
    success: z.literal(true),
    message: z.string().openapi({ description: 'Success message' }),
  })
  .openapi('SuccessResponse');

// ============================================================================
// Register Common Schemas
// ============================================================================

registry.register('UUID', UUIDSchema);
registry.register('Timestamp', TimestampSchema);
registry.register('Email', EmailSchema);
registry.register('ErrorResponse', ErrorResponseSchema);
registry.register('ValidationError', ValidationErrorSchema);
registry.register('SuccessResponse', SuccessResponseSchema);
```

**Paso 2.5: Crear `schemas/index.ts`**

```typescript
// src/lib/openapi/schemas/index.ts

export * from './common';
// Agregar más exports según se creen schemas de dominio
```

---

### FASE 3: Crear Endpoint /api/openapi

**Paso 3.1: Crear directorio y archivo**

```bash
mkdir -p src/app/api/openapi
```

**Paso 3.2: Crear `route.ts`**

```typescript
// src/app/api/openapi/route.ts

/**
 * GET /api/openapi
 *
 * Serves the OpenAPI specification for the API.
 * Auto-generated from Zod schemas and always up-to-date.
 */

import { NextResponse } from 'next/server';
import { generateOpenAPIDocument } from '@/lib/openapi';

export async function GET() {
  try {
    const document = generateOpenAPIDocument();

    return NextResponse.json(document, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control':
          process.env.NODE_ENV === 'production'
            ? 'public, max-age=86400, s-maxage=86400'
            : 'no-cache',
      },
    });
  } catch (error) {
    console.error('[OpenAPI] Failed to generate document:', error);

    return NextResponse.json(
      { error: 'Failed to generate OpenAPI specification' },
      { status: 500 }
    );
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
```

---

### FASE 4: Crear ruta /api/docs (Scalar)

Scalar se monta como **route handler** de Next.js App Router — un solo archivo, sin página ni componentes React. Sirve la UI interactiva desde el spec de `/api/openapi`, con el gate de entorno (404 en producción).

**Paso 4.1: Crear el route handler**

```bash
mkdir -p "src/app/api/docs"
```

```typescript
// src/app/api/docs/route.ts

import { ApiReference } from "@scalar/nextjs-api-reference";

// 404 en producción: la doc de API no se expone públicamente.
function isAllowedEnvironment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) {
    // En Vercel: permitir preview (staging), bloquear production
    return vercelEnv !== "production";
  }
  // Local: permitir solo en development
  return process.env.NODE_ENV === "development";
}

// ApiReference(config) devuelve un handler () => Response (SIN argumentos).
const handler = ApiReference({
  // Multi-documento nativo de Scalar. El primero (o `default: true`) es el activo.
  sources: [
    { title: "Next.js API", slug: "nextjs", url: "/api/openapi", default: true },
    // Opcional — Supabase REST (la anon key es pública por diseño):
    // {
    //   title: "Supabase REST",
    //   slug: "supabase",
    //   url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/?apikey=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    // },
  ],
  theme: "purple", // matchear brand (Redoc usaba #7c3aed)
  pageTitle: "[PROJECT_NAME] — API Reference",
});

export async function GET(): Promise<Response> {
  if (!isAllowedEnvironment()) {
    return new Response(null, { status: 404 });
  }
  return handler();
}
```

> **Auth en la UI**: Scalar renderiza los métodos de autenticación desde el `info.description` + los `securitySchemes` del spec (definidos en `src/lib/openapi/registry.ts`, FASE 2). No hace falta un panel de auth aparte.
>
> **Multi-spec**: para exponer también el REST de Supabase, descomentar la segunda `source`. Scalar muestra un selector de documentos nativo. Confirmá vía Context7 que la versión instalada de `@scalar/nextjs-api-reference` soporta `sources`; si no, montá una segunda ruta `src/app/api/docs/supabase/route.ts` con su propia `url`.
>
> **`notFound()` NO se usa en route handlers** (es para RSC/pages) — el gate devuelve `new Response(null, { status: 404 })`.

> **Migración desde Redoc**: el antiguo `auth-info-panel.tsx` (y `redoc-viewer.tsx`, `api-doc-selector.tsx`, `page.tsx`, y el layout `(minimal)/layout.tsx`) se eliminan. La info de autenticación (cookie de sesión Supabase `sb-[SUPABASE_PROJECT_ID]-auth-token`, `Authorization: Bearer`, `X-API-Key`, `CRON_SECRET`) vive ahora en los `securitySchemes` del registry (FASE 2) + `info.description`; Scalar la renderiza en `/api/docs`. Reemplazá `[SUPABASE_PROJECT_ID]` donde aparezca en `registry.ts`.

**Paso 4.2: (si migrás un proyecto existente) limpiar Redoc**

```bash
# Borrar la implementación vieja de Redoc si existe
rm -rf "src/app/(minimal)/api-docu"
# Borrar el layout minimal SOLO si ninguna otra página lo usa
[ -z "$(ls -A 'src/app/(minimal)' 2>/dev/null)" ] && rm -f "src/app/(minimal)/layout.tsx" && rmdir "src/app/(minimal)" 2>/dev/null || true
```

---

### FASE 5: (COMPLETO) Crear Schemas de Dominio con Single Source of Truth

**Solo si hay endpoints existentes.**

> **⚠️ CRÍTICO:** Los schemas de dominio deben definirse en `src/types/`, NO en `src/lib/openapi/schemas/`. Ver sección "PATRÓN CRÍTICO: Single Source of Truth" arriba.

**Paso 5.1: Analizar endpoints y tipos existentes**

```bash
# Listar endpoints existentes
find src/app/api -name "route.ts" | grep -v "openapi"

# Listar tipos existentes (pueden ya tener schemas Zod)
ls src/types/
```

**Paso 5.2: Crear o actualizar schema en src/types/**

Por cada dominio identificado (ej: users, bookings, payments), crear en `src/types/`:

```typescript
// src/types/booking.ts (FUENTE DE VERDAD)

import { z } from '@/lib/openapi/zod'; // instancia única extendida — NUNCA importar de 'zod' si usás .openapi()

// ============================================================================
// SCHEMAS (con metadata OpenAPI)
// ============================================================================

export const BookingStatusSchema = z
  .enum(['pending', 'confirmed', 'cancelled', 'completed'])
  .openapi('BookingStatus');

export const BookingSchema = z
  .object({
    id: z.uuid().openapi({ description: 'Unique booking identifier' }),
    userId: z.uuid().openapi({ description: 'User who made the booking' }),
    serviceId: z.uuid().openapi({ description: 'Service being booked' }),
    status: BookingStatusSchema,
    scheduledAt: z.iso.datetime().openapi({ description: 'Scheduled date/time' }),
    notes: z.string().nullable().optional().openapi({ description: 'Additional notes' }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi('Booking');

// Schemas para input (omitir campos autogenerados)
export const CreateBookingSchema = BookingSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).openapi('CreateBooking');

export const UpdateBookingSchema = BookingSchema.partial()
  .omit({
    id: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
  })
  .openapi('UpdateBooking');

// ============================================================================
// TIPOS INFERIDOS (siempre sincronizados con schemas)
// ============================================================================

export type BookingStatus = z.infer<typeof BookingStatusSchema>;
export type Booking = z.infer<typeof BookingSchema>;
export type CreateBooking = z.infer<typeof CreateBookingSchema>;
export type UpdateBooking = z.infer<typeof UpdateBookingSchema>;

// ============================================================================
// HELPERS DE VALIDACIÓN (para usar en API routes)
// ============================================================================

export function isValidBookingStatus(status: string): status is BookingStatus {
  return BookingStatusSchema.safeParse(status).success;
}
```

**Paso 5.3: Registrar paths en src/lib/openapi/schemas/**

Crear archivo que SOLO registra paths, importando schemas de `@/types`:

```typescript
// src/lib/openapi/schemas/bookings.ts (SOLO PATHS, NO SCHEMAS)

import { registry } from '../registry';
import { z } from '../zod'; // instancia única extendida
import { BookingSchema, CreateBookingSchema, UpdateBookingSchema } from '@/types/booking'; // ← IMPORTA de types
import { ErrorResponseSchema, UUIDSchema } from './common';

// ============================================================================
// REGISTRAR PATHS (no definir schemas aquí)
// ============================================================================

// GET /bookings
registry.registerPath({
  method: 'get',
  path: '/bookings',
  tags: ['Bookings'],
  summary: 'List all bookings',
  security: [{ cookieAuth: [] }],
  request: {
    query: z.object({
      status: z.string().optional().openapi({ description: 'Filter by status' }),
      limit: z.coerce.number().optional().default(20),
      offset: z.coerce.number().optional().default(0),
    }),
  },
  responses: {
    200: {
      description: 'List of bookings',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(BookingSchema), // ← USA schema importado
            total: z.number(),
          }),
        },
      },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// GET /bookings/{id}
registry.registerPath({
  method: 'get',
  path: '/bookings/{id}',
  tags: ['Bookings'],
  summary: 'Get booking by ID',
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({ id: UUIDSchema }),
  },
  responses: {
    200: {
      description: 'Booking details',
      content: { 'application/json': { schema: BookingSchema } },
    },
    404: {
      description: 'Booking not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// POST /bookings
registry.registerPath({
  method: 'post',
  path: '/bookings',
  tags: ['Bookings'],
  summary: 'Create a new booking',
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': { schema: CreateBookingSchema }, // ← USA schema importado
      },
    },
  },
  responses: {
    201: {
      description: 'Booking created',
      content: { 'application/json': { schema: BookingSchema } },
    },
    400: {
      description: 'Invalid request',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// PATCH /bookings/{id}
registry.registerPath({
  method: 'patch',
  path: '/bookings/{id}',
  tags: ['Bookings'],
  summary: 'Update a booking',
  security: [{ cookieAuth: [] }],
  request: {
    params: z.object({ id: UUIDSchema }),
    body: {
      content: {
        'application/json': { schema: UpdateBookingSchema }, // ← USA schema importado
      },
    },
  },
  responses: {
    200: {
      description: 'Booking updated',
      content: { 'application/json': { schema: BookingSchema } },
    },
    404: {
      description: 'Booking not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});
```

**Paso 5.4: Actualizar index.ts**

```typescript
// src/lib/openapi/schemas/index.ts

export * from './common';
export * from './bookings'; // Solo exporta los registros de paths
// Agregar más según se creen
```

**Paso 5.5: Verificar que no hay duplicación**

```bash
# Buscar schemas duplicados (NO debería haber .openapi() en lib/openapi/schemas/)
grep -r "\.openapi\(" src/lib/openapi/schemas/ --include="*.ts" | grep -v "common.ts"

# Si encuentra algo, mover esos schemas a src/types/
```

> **⚠️ ADVERTENCIA:** Si `grep` encuentra schemas con `.openapi()` en `src/lib/openapi/schemas/` (excepto `common.ts`), esos schemas están duplicados. Muévelos a `src/types/` e importa desde ahí.

---

### FASE 6: Validación

**Paso 6.1: TypeScript check**

```bash
bun run typecheck
```

**Paso 6.2: Verificar endpoint**

```bash
bun run dev &
sleep 3
curl -s http://localhost:3000/api/openapi | jq '.info.title'
```

**Output esperado:** El título del proyecto configurado.

**Paso 6.3: Verificar UI**

1. Abrir `http://localhost:3000/api/docs`
2. Verificar que Scalar carga y renderiza los endpoints del spec
3. Verificar que la sección de autenticación (desde `securitySchemes` + `info.description`) aparece
4. (Si habilitaste multi-spec) verificar el selector de documentos Next.js/Supabase de Scalar

---

## 📋 CHECKLIST FINAL

### Modo PARCIAL:

- [ ] `src/lib/openapi/registry.ts` creado con info del proyecto
- [ ] `src/lib/openapi/index.ts` creado
- [ ] `src/lib/openapi/schemas/common.ts` creado
- [ ] `src/lib/openapi/schemas/index.ts` creado
- [ ] `src/app/api/openapi/route.ts` creado
- [ ] `src/app/api/docs/route.ts` creado (Scalar route handler)
- [ ] `@scalar/nextjs-api-reference` instalado
- [ ] `/api/openapi` retorna JSON válido
- [ ] `/api/docs` renderiza Scalar (404 en producción)
- [ ] Auth visible en la UI (desde `securitySchemes` + `info.description`)

### Modo COMPLETO (adicional):

- [ ] Schemas de dominio creados en `src/types/` (con `.openapi()`)
- [ ] Tipos inferidos con `z.infer<>` en `src/types/`
- [ ] Path registrations en `src/lib/openapi/schemas/` (solo importan de `@/types`)
- [ ] Endpoints registrados en OpenAPI
- [ ] Tags configurados por dominio
- [ ] **NO hay schemas duplicados** (verificar con `grep -r "\.openapi\(" src/lib/openapi/schemas/`)

---

## 🎉 REPORTE FINAL

```markdown
# ✅ OpenAPI Setup Completado

## Modo: [PARCIAL/COMPLETO]

## Archivos Creados:

### OpenAPI Core:

- src/lib/openapi/registry.ts
- src/lib/openapi/index.ts
- src/lib/openapi/schemas/common.ts
- src/lib/openapi/schemas/index.ts

### Endpoint:

- src/app/api/openapi/route.ts

### UI (Scalar):

- src/app/api/docs/route.ts

## URLs Disponibles:

- `/api/openapi` - JSON spec para herramientas
- `/api/docs` - UI interactiva Scalar (solo dev/staging)

## Próximos Pasos:

1. Al crear nuevos endpoints:
   - Definir schemas Zod en `src/types/[dominio].ts` con `.openapi()`
   - Registrar paths en `src/lib/openapi/schemas/[dominio].ts`
   - **NUNCA duplicar schemas** - siempre importar de `@/types`
2. Al agregar métodos de auth: registrarlos en `securitySchemes` del registry + `info.description` (Scalar los muestra automáticamente en `/api/docs`)

## Patrón Single Source of Truth:

- ✅ Schemas en `src/types/` → Tipos + Validación + OpenAPI
- ✅ Paths en `src/lib/openapi/schemas/` → Solo `registerPath()`
- ❌ NO definir schemas en `src/lib/openapi/schemas/`
```

---

## ❓ PREGUNTAS FRECUENTES

**P: ¿Por qué /api/docs retorna 404 en production?**
R: Es intencional. La documentación de API no debe exponerse públicamente. El route handler de Scalar aplica `isAllowedEnvironment()` y devuelve `new Response(null, { status: 404 })` en producción. Solo está disponible en development y staging.

**P: ¿Cómo registro un nuevo endpoint?**
R: Primero define el schema en `src/types/`, luego registra el path:

```typescript
// 1. src/types/user.ts (PRIMERO - definir schema)
export const UserSchema = z.object({...}).openapi('User');
export type User = z.infer<typeof UserSchema>;

// 2. src/lib/openapi/schemas/users.ts (DESPUÉS - registrar path)
import { UserSchema } from '@/types/user';

registry.registerPath({
  method: 'post',
  path: '/users',
  tags: ['Users'],
  request: { body: { content: { 'application/json': { schema: UserSchema } } } },
  // ...
});
```

**P: ¿Por qué no puedo definir schemas en `src/lib/openapi/schemas/`?**
R: Para evitar duplicación y desincronización. Si defines schemas en dos lugares (types + openapi), al agregar un campo puedes olvidar actualizar uno. Con Single Source of Truth, cambias UN archivo y todo se actualiza automáticamente.

**P: ¿Qué pasa si ya tengo schemas duplicados?**
R: Migra los schemas a `src/types/`:

```bash
# Encontrar schemas duplicados
grep -r "\.openapi\(" src/lib/openapi/schemas/ --include="*.ts" | grep -v "common.ts"

# Para cada uno encontrado:
# 1. Mover el schema a src/types/[dominio].ts
# 2. Cambiar el import en src/lib/openapi/schemas/[dominio].ts
# 3. Eliminar la definición duplicada
```

**P: ¿Puedo ejecutar este prompt de nuevo?**
R: Sí. Si ya existe la estructura, el prompt pasará a modo COMPLETO y analizará nuevos endpoints para registrar.

**P: ¿Funciona con Stripe webhooks?**
R: Sí, agrega un security scheme para Stripe-Signature y regístralo en los endpoints de webhook.

**P: ¿Cómo sé si mi OpenAPI está sincronizado con los tipos?**
R: Si seguiste el patrón Single Source of Truth, **siempre** están sincronizados porque vienen del mismo archivo. Verifica con:

```bash
# No debería encontrar nada (excepto common.ts)
grep -r "\.openapi\(" src/lib/openapi/schemas/ --include="*.ts" | grep -v "common.ts"
```
