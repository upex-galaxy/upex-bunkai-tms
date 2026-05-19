Actúa como Senior API Developer, Documentation Engineer, y Full-Stack Developer.

---

## 🎯 TAREA

**🔧 FEATURE: OpenAPI + Zod Setup (Fase 3 - Infrastructure)**

Configurar un sistema completo de **documentación de APIs** que incluye:

- Registry OpenAPI con Zod schemas
- Endpoint `/api/openapi` que genera spec JSON
- Página `/api-docu` con UI interactiva (Redoc)
- Panel de información de autenticación para testers

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
- UI `/api-docu` con info genérica
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
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// Schema con metadata OpenAPI
export const CommunicationChannelSchema = z
  .object({
    id: z.string().uuid(),
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
import { z } from 'zod';
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
// ✅ Documentación en /api-docu actualizada
```

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

**UI (`src/app/(minimal)/api-docu/`):**

- ✅ `page.tsx` - Página principal
- ✅ `redoc-viewer.tsx` - Viewer client
- ✅ `api-doc-selector.tsx` - Selector API
- ✅ `auth-info-panel.tsx` - Info autenticación

**Layout (`src/app/(minimal)/`):**

- ✅ `layout.tsx` - Layout minimal

### Modo COMPLETO (adicional):

**Tipos de dominio (`src/types/`):** ← FUENTE DE VERDAD

- ✅ `[dominio].ts` - Zod schemas con `.openapi()` + tipos inferidos
- ✅ Helpers de validación para API routes

**Path registrations (`src/lib/openapi/schemas/`):**

- ✅ `[dominio].ts` - Solo `registry.registerPath()`, importa de `@/types`
- ✅ Endpoints registrados en registry
- ✅ Auth info panel con detalles específicos

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
grep -E "zod|openapi" package.json
```

**Paso 1.2: Instalar (si necesario)**

```bash
# Consultar Context7 primero para versiones actuales
bun add @asteasolutions/zod-to-openapi zod
```

**Verificar instalación:**

```bash
bun pm ls | grep -E "zod|openapi"
```

---

### FASE 2: Crear Estructura OpenAPI

**Paso 2.1: Crear directorio**

```bash
mkdir -p src/lib/openapi/schemas
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

import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Extend Zod with OpenAPI methods
extendZodWithOpenApi(z);

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

| Environment | URL |
|------------|-----|
| Development | \`http://localhost:3000/api\` |
| Staging | \`[STAGING_URL]/api\` |
| Production | \`[PRODUCTION_URL]/api\` |
      `.trim(),
      contact: {
        name: 'Development Team',
        url: '[REPO_URL]',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/api',
        description: 'Development server',
      },
      {
        url: '[STAGING_URL]/api', // Reemplazar
        description: 'Staging server',
      },
      {
        url: '[PRODUCTION_URL]/api', // Reemplazar
        description: 'Production server',
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
- `[STAGING_URL]`
- `[PRODUCTION_URL]`
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

export const UUIDSchema = z.string().uuid().openapi({
  description: 'UUID v4 identifier',
  example: '550e8400-e29b-41d4-a716-446655440000',
});

export const TimestampSchema = z.string().datetime().openapi({
  description: 'ISO 8601 timestamp',
  example: '2024-01-15T10:30:00Z',
});

export const EmailSchema = z.string().email().openapi({
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

### FASE 4: Crear Página /api-docu

**Paso 4.1: Crear layout minimal**

```bash
mkdir -p "src/app/(minimal)/api-docu"
```

```typescript
// src/app/(minimal)/layout.tsx

/**
 * Minimal layout for documentation pages
 * No sidebar, no header - just the content
 */

export default function MinimalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      {children}
    </div>
  )
}
```

**Paso 4.2: Crear `page.tsx`**

```typescript
// src/app/(minimal)/api-docu/page.tsx

import { notFound } from "next/navigation";
import { RedocViewer } from "./redoc-viewer";
import { ApiDocSelector } from "./api-doc-selector";
import { AuthInfoPanel } from "./auth-info-panel";

// Check if we're in an allowed environment
function isAllowedEnvironment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;

  if (vercelEnv) {
    // On Vercel: allow preview (staging), block production
    return vercelEnv !== "production";
  }

  // Local development: always allow
  return process.env.NODE_ENV === "development";
}

interface PageProps {
  searchParams: Promise<{ api?: string }>;
}

export default async function ApiDocuPage({ searchParams }: PageProps) {
  // Return 404 in production
  if (!isAllowedEnvironment()) {
    notFound();
  }

  const params = await searchParams;
  const apiType = params.api || "nextjs";

  // Build the OpenAPI spec URL based on selected API
  // Para Supabase, necesitas importar las variables de config
  const specUrl = apiType === "supabase"
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/?apikey=${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
    : "/api/openapi";

  return (
    <div className="min-h-screen bg-background">
      <ApiDocSelector currentApi={apiType} />
      <AuthInfoPanel apiType={apiType} />
      <RedocViewer specUrl={specUrl} />
    </div>
  );
}
```

**Paso 4.3: Crear `redoc-viewer.tsx`**

```typescript
// src/app/(minimal)/api-docu/redoc-viewer.tsx

"use client";

import { useEffect, useRef } from "react";

interface RedocViewerProps {
  specUrl: string;
}

export function RedocViewer({ specUrl }: RedocViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load Redoc from CDN
    const script = document.createElement("script");
    script.src = "https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js";
    script.async = true;

    script.onload = () => {
      if (containerRef.current && window.Redoc) {
        window.Redoc.init(specUrl, {
          theme: {
            colors: {
              primary: { main: "#7c3aed" }, // Purple to match brand
            },
            typography: {
              fontFamily: "system-ui, sans-serif",
            },
          },
          hideDownloadButton: false,
          expandResponses: "200,201",
        }, containerRef.current);
      }
    };

    document.body.appendChild(script);

    return () => {
      // Cleanup
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [specUrl]);

  return <div ref={containerRef} />;
}

// Type declaration for Redoc
declare global {
  interface Window {
    Redoc?: {
      init: (
        specUrl: string,
        options: Record<string, unknown>,
        element: HTMLElement
      ) => void;
    };
  }
}
```

**Paso 4.4: Crear `api-doc-selector.tsx`**

```typescript
// src/app/(minimal)/api-docu/api-doc-selector.tsx

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Database, Server } from "lucide-react";

interface ApiDocSelectorProps {
  currentApi: string;
}

export function ApiDocSelector({ currentApi }: ApiDocSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleApiChange = (api: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("api", api);
    router.push(`/api-docu?${params.toString()}`);
  };

  return (
    <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">API Documentation</h1>

          <div className="flex gap-2">
            <button
              onClick={() => handleApiChange("nextjs")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                currentApi === "nextjs"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              <Server className="h-4 w-4" />
              Next.js API
            </button>

            <button
              onClick={() => handleApiChange("supabase")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                currentApi === "supabase"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              <Database className="h-4 w-4" />
              Supabase REST
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Paso 4.5: Crear `auth-info-panel.tsx`**

```typescript
// src/app/(minimal)/api-docu/auth-info-panel.tsx

"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Key, Cookie, FileText } from "lucide-react";

interface AuthInfoPanelProps {
  apiType: string;
}

export function AuthInfoPanel({ apiType }: AuthInfoPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isNextJs = apiType === "nextjs";

  // Cookie name - REEMPLAZAR [SUPABASE_PROJECT_ID] con ID real
  const cookieName = "sb-[SUPABASE_PROJECT_ID]-auth-token";

  return (
    <div className="border-b border-border bg-muted/30">
      <div className="max-w-7xl mx-auto px-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full py-3 flex items-center justify-between text-sm hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {isNextJs ? (
              <Cookie className="h-4 w-4 text-blue-500" />
            ) : (
              <Key className="h-4 w-4 text-green-500" />
            )}
            <span className="font-medium">
              {isNextJs ? "Cookie-based Authentication" : "API Key + JWT Authentication"}
            </span>
            <span className="text-muted-foreground">
              - Click for quick reference
            </span>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {isExpanded && (
          <div className="pb-4 grid md:grid-cols-2 gap-4">
            {isNextJs ? (
              <>
                <div className="bg-background border rounded-lg p-4">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <Cookie className="h-4 w-4 text-blue-500" />
                    Most Endpoints (Cookie Auth)
                  </h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Supabase session cookies are sent automatically from the browser.
                  </p>
                  <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto">
                    Cookie: {cookieName}=...
                  </code>
                </div>
                <div className="bg-background border rounded-lg p-4">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <Key className="h-4 w-4 text-amber-500" />
                    Special Endpoints
                  </h4>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><strong>Cron jobs:</strong> Authorization: Bearer CRON_SECRET</p>
                    <p><strong>Testing:</strong> X-API-Key: [your-key]</p>
                    <p><strong>Webhooks:</strong> Signature header from provider</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-background border rounded-lg p-4">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <Key className="h-4 w-4 text-green-500" />
                    Required Headers
                  </h4>
                  <div className="text-xs space-y-2">
                    <div>
                      <p className="text-muted-foreground mb-1">Always required:</p>
                      <code className="bg-muted px-2 py-1 rounded block">
                        apikey: {"<SUPABASE_ANON_KEY>"}
                      </code>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">For authenticated requests:</p>
                      <code className="bg-muted px-2 py-1 rounded block">
                        Authorization: Bearer {"<JWT_TOKEN>"}
                      </code>
                    </div>
                  </div>
                </div>
                <div className="bg-background border rounded-lg p-4">
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-purple-500" />
                    Getting the JWT
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Login via Supabase Auth, then extract the access_token from the session.
                    See <code className="bg-muted px-1 rounded">docs/api-testing/</code> for detailed guides.
                  </p>
                </div>
              </>
            )}
            <div className="md:col-span-2 text-xs text-muted-foreground border-t pt-3 mt-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>
                For detailed guides and Postman collections, see{" "}
                <code className="bg-muted px-1 rounded">docs/api-testing/</code>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**IMPORTANTE:** Reemplazar `[SUPABASE_PROJECT_ID]` en el archivo.

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

import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

// ============================================================================
// SCHEMAS (con metadata OpenAPI)
// ============================================================================

export const BookingStatusSchema = z
  .enum(['pending', 'confirmed', 'cancelled', 'completed'])
  .openapi('BookingStatus');

export const BookingSchema = z
  .object({
    id: z.string().uuid().openapi({ description: 'Unique booking identifier' }),
    userId: z.string().uuid().openapi({ description: 'User who made the booking' }),
    serviceId: z.string().uuid().openapi({ description: 'Service being booked' }),
    status: BookingStatusSchema,
    scheduledAt: z.string().datetime().openapi({ description: 'Scheduled date/time' }),
    notes: z.string().nullable().optional().openapi({ description: 'Additional notes' }),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
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
import { z } from 'zod';
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

1. Abrir `http://localhost:3000/api-docu`
2. Verificar que Redoc carga
3. Verificar selector Next.js/Supabase funciona
4. Verificar auth info panel se expande

---

## 📋 CHECKLIST FINAL

### Modo PARCIAL:

- [ ] `src/lib/openapi/registry.ts` creado con info del proyecto
- [ ] `src/lib/openapi/index.ts` creado
- [ ] `src/lib/openapi/schemas/common.ts` creado
- [ ] `src/lib/openapi/schemas/index.ts` creado
- [ ] `src/app/api/openapi/route.ts` creado
- [ ] `src/app/(minimal)/layout.tsx` creado
- [ ] `src/app/(minimal)/api-docu/` con 4 archivos
- [ ] `/api/openapi` retorna JSON válido
- [ ] `/api-docu` renderiza Redoc
- [ ] Auth info panel funciona

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

### UI:

- src/app/(minimal)/layout.tsx
- src/app/(minimal)/api-docu/page.tsx
- src/app/(minimal)/api-docu/redoc-viewer.tsx
- src/app/(minimal)/api-docu/api-doc-selector.tsx
- src/app/(minimal)/api-docu/auth-info-panel.tsx

## URLs Disponibles:

- `/api/openapi` - JSON spec para herramientas
- `/api-docu` - UI interactiva (solo dev/staging)

## Próximos Pasos:

1. Al crear nuevos endpoints:
   - Definir schemas Zod en `src/types/[dominio].ts` con `.openapi()`
   - Registrar paths en `src/lib/openapi/schemas/[dominio].ts`
   - **NUNCA duplicar schemas** - siempre importar de `@/types`
2. Actualizar auth-info-panel si agregas métodos de auth

## Patrón Single Source of Truth:

- ✅ Schemas en `src/types/` → Tipos + Validación + OpenAPI
- ✅ Paths en `src/lib/openapi/schemas/` → Solo `registerPath()`
- ❌ NO definir schemas en `src/lib/openapi/schemas/`
```

---

## ❓ PREGUNTAS FRECUENTES

**P: ¿Por qué /api-docu retorna 404 en production?**
R: Es intencional. La documentación de API no debe exponerse públicamente. Solo está disponible en development y staging.

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
