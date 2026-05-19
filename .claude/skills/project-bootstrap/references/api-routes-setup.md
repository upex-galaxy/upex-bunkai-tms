Actúa como Senior Backend Developer, API Architect, y Next.js Expert.

---

## 🎯 TAREA

**🔧 FEATURE: API Routes Setup (Fase 3 - Infrastructure)**

Crear la **estructura base de custom API endpoints** en Next.js con:

- Organización por dominios
- Patterns de validación con Zod
- Error handling estandarizado
- Integración con Supabase
- (Opcional) Registro en OpenAPI

---

## 📥 INPUT REQUERIDO

### 1. Contexto del Proyecto

**Leer estos archivos:**

- `.context/SRS/functional-specs.md` - Requerimientos funcionales
- `.context/SRS/architecture-specs.md` - Arquitectura y endpoints planeados
- `.context/PRD/mvp-scope.md` - Features del MVP
- `src/lib/supabase/server.ts` - Server client existente
- `src/lib/openapi/` - (Si existe) Sistema OpenAPI

### 2. Información a Extraer

- **Dominios del proyecto** → Para organizar endpoints
- **Endpoints necesarios** → Según SRS y MVP scope
- **Integraciones** → Stripe, email, etc.

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS

### MCP Requeridos:

1. **MCP Context7** - Para verificar APIs de Next.js

### Dependencias Existentes (verificar):

- `zod` - Para validación
- `@supabase/ssr` - Para auth

---

## 🔀 DETECCIÓN DE MODO

**Ejecutar análisis para determinar modo:**

```bash
# Verificar si existe OpenAPI setup
ls -la src/lib/openapi/registry.ts 2>/dev/null

# Verificar SRS para endpoints planeados
grep -i "endpoint\|api\|route" .context/SRS/functional-specs.md | head -10
```

**Resultado:**

| Condición                                        | Modo         |
| ------------------------------------------------ | ------------ |
| No hay SRS detallado o pocos endpoints planeados | **PARCIAL**  |
| SRS con endpoints definidos + OpenAPI existente  | **COMPLETO** |

### Modo PARCIAL:

- Crea estructura de carpetas base
- Un endpoint de ejemplo con patterns
- Documentación de convenciones

### Modo COMPLETO (adicional):

- Crea endpoints según SRS
- Integración con OpenAPI registry
- Schemas Zod por dominio

---

## 📤 OUTPUT GENERADO

### Modo PARCIAL:

**Estructura (`src/app/api/`):**

- ✅ Estructura de carpetas por dominio
- ✅ Endpoint de ejemplo con validación
- ✅ Utilities de error handling

**Documentación:**

- ✅ Patterns documentados en código
- ✅ (Si OpenAPI) Endpoints auto-documentados en `/api-docu`

### Modo COMPLETO (adicional):

- ✅ Endpoints según SRS
- ✅ Schemas Zod registrados en OpenAPI
- ✅ Todos los dominios implementados

---

## 🛠️ PASOS DETALLADOS

### FASE 0: Análisis

**Paso 0.1: Identificar dominios**

Leer `.context/SRS/` y `.context/PRD/` para identificar los dominios principales.

**Ejemplos de dominios típicos:**

- `auth` - Autenticación custom
- `users` - Gestión de usuarios
- `stripe` - Pagos (webhook, checkout, connect)
- `email` - Envío de emails
- `cron` - Jobs programados
- `[dominio-específico]` - Según el proyecto

**Paso 0.2: Verificar OpenAPI**

```bash
ls -la src/lib/openapi/registry.ts 2>/dev/null && echo "OpenAPI existe" || echo "Sin OpenAPI"
```

Si existe OpenAPI, los endpoints se registrarán automáticamente.

---

### FASE 1: Crear Estructura de Carpetas

**Paso 1.1: Estructura recomendada**

```bash
mkdir -p src/app/api
```

**Estructura por dominio:**

```
src/app/api/
├── openapi/
│   └── route.ts              # (De openapi-setup)
├── health/
│   └── route.ts              # GET - Health check
├── stripe/
│   ├── webhook/
│   │   └── route.ts          # POST - Stripe webhooks
│   ├── checkout/
│   │   └── route.ts          # POST - Create checkout session
│   └── connect/
│       ├── onboard/
│       │   └── route.ts      # POST - Start Connect onboarding
│       └── status/
│           └── route.ts      # GET - Connect account status
├── email/
│   └── [template]/
│       └── route.ts          # POST - Trigger email
├── cron/
│   └── [job-name]/
│       └── route.ts          # POST - Cron job endpoint
└── [dominio]/
    ├── route.ts              # Collection: GET (list), POST (create)
    └── [id]/
        └── route.ts          # Item: GET, PATCH, DELETE
```

---

### FASE 2: Crear Utilities de API

**Paso 2.1: Crear helper de responses**

```typescript
// src/lib/api/responses.ts

import { NextResponse } from 'next/server';

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(message: string, status = 400, details?: string) {
  return NextResponse.json({ error: message, ...(details && { details }) }, { status });
}

export function validationError(field: string, message: string) {
  return NextResponse.json({ error: message, field }, { status: 400 });
}

export function unauthorizedError(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenError(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFoundError(resource = 'Resource') {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 });
}

export function serverError(message = 'Internal server error') {
  return NextResponse.json({ error: message }, { status: 500 });
}
```

**Paso 2.2: Crear helper de auth**

```typescript
// src/lib/api/auth.ts

import { createServer } from '@/lib/supabase/server';
import { unauthorizedError } from './responses';

export async function getAuthenticatedUser() {
  const supabase = await createServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, error: unauthorizedError() };
  }

  return { user, error: null };
}

export async function requireAuth() {
  const { user, error } = await getAuthenticatedUser();

  if (error) {
    throw error; // Will be caught by route handler
  }

  return user!;
}
```

---

### FASE 3: Crear Endpoint de Ejemplo

**Paso 3.1: Health check endpoint**

```typescript
// src/app/api/health/route.ts

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring.
 * Returns basic system status.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
}
```

**Paso 3.2: Endpoint con validación (ejemplo completo)**

```typescript
// src/app/api/example/route.ts

/**
 * Example endpoint showing all patterns:
 * - Zod validation
 * - Auth check
 * - Supabase integration
 * - Error handling
 * - OpenAPI registration (if available)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServer } from '@/lib/supabase/server';
import { successResponse, errorResponse, validationError, serverError } from '@/lib/api/responses';
import { getAuthenticatedUser } from '@/lib/api/auth';

// ============================================================================
// Validation Schemas
// ============================================================================

const CreateExampleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().optional(),
});

// ============================================================================
// GET /api/example - List items
// ============================================================================

export async function GET() {
  try {
    // Auth check
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError) return authError;

    // Query database
    const supabase = await createServer();
    const { data, error } = await supabase
      .from('examples')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[API] Failed to fetch examples:', error);
      return serverError('Failed to fetch data');
    }

    return successResponse(data);
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return serverError();
  }
}

// ============================================================================
// POST /api/example - Create item
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const { user, error: authError } = await getAuthenticatedUser();
    if (authError) return authError;

    // Parse and validate body
    const body = await request.json().catch(() => null);

    if (!body) {
      return errorResponse('Invalid JSON body');
    }

    const validation = CreateExampleSchema.safeParse(body);

    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return validationError(firstError.path.join('.'), firstError.message);
    }

    const { name, description } = validation.data;

    // Insert into database
    const supabase = await createServer();
    const { data, error } = await supabase
      .from('examples')
      .insert({
        user_id: user!.id,
        name,
        description,
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Failed to create example:', error);
      return serverError('Failed to create');
    }

    return successResponse(data, 201);
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return serverError();
  }
}
```

---

### FASE 4: (COMPLETO) Integración con OpenAPI

**Solo si `openapi-setup` fue ejecutado.**

**Paso 4.1: Registrar endpoint en OpenAPI**

```typescript
// src/lib/openapi/schemas/example.ts

import { registry, z } from '../registry';

// Define schemas
export const ExampleSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    created_at: z.string().datetime(),
  })
  .openapi('Example');

export const CreateExampleSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
  })
  .openapi('CreateExample');

// Register schemas
registry.register('Example', ExampleSchema);
registry.register('CreateExample', CreateExampleSchema);

// Register endpoints
registry.registerPath({
  method: 'get',
  path: '/example',
  tags: ['Example'],
  summary: 'List examples',
  security: [{ cookieAuth: [] }],
  responses: {
    200: {
      description: 'List of examples',
      content: {
        'application/json': {
          schema: z.array(ExampleSchema),
        },
      },
    },
    401: {
      description: 'Unauthorized',
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/example',
  tags: ['Example'],
  summary: 'Create example',
  security: [{ cookieAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateExampleSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Created',
      content: {
        'application/json': {
          schema: ExampleSchema,
        },
      },
    },
    400: {
      description: 'Validation error',
    },
    401: {
      description: 'Unauthorized',
    },
  },
});
```

**Paso 4.2: Actualizar barrel export**

```typescript
// src/lib/openapi/schemas/index.ts

export * from './common';
export * from './example'; // Agregar
```

---

### FASE 5: Crear Endpoints Según SRS

**Solo en modo COMPLETO.**

**Para cada dominio identificado en FASE 0:**

1. Crear carpeta en `src/app/api/[dominio]/`
2. Crear `route.ts` con operaciones collection (GET list, POST create)
3. Crear `[id]/route.ts` con operaciones item (GET, PATCH, DELETE)
4. (Si OpenAPI) Registrar schemas y endpoints

**Pattern para endpoints de Stripe:**

```typescript
// src/app/api/stripe/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    // Handle event types
    switch (event.type) {
      case 'checkout.session.completed':
        // Handle successful payment
        break;
      // ... more event types
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 });
  }
}
```

**Pattern para Cron jobs:**

```typescript
// src/app/api/cron/[job-name]/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Execute job logic
    console.log('[Cron] Running job...');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Cron] Job failed:', error);
    return NextResponse.json({ error: 'Job failed' }, { status: 500 });
  }
}
```

---

### FASE 6: Verificar Documentación

**Nota:** La documentación de endpoints se maneja automáticamente:

- **Endpoints**: Si ejecutaste `openapi-setup.md`, los endpoints se documentan automáticamente en `/api-docu` (Redoc UI)
- **Autenticación**: Documentada en `.context/api-auth.md` (generado por `backend-setup.md`)

**Paso 6.1: Verificar integración OpenAPI**

Si OpenAPI está configurado, los endpoints creados con schemas en `src/lib/openapi/schemas/` aparecerán automáticamente en la documentación interactiva.

```bash
# Verificar que la documentación se actualiza
curl http://localhost:3000/api/openapi | jq '.paths | keys'
```

**Paso 6.2: Patterns documentados en código**

Los patterns de API ya están documentados en el código:

- `src/lib/api/responses.ts` - Error handling helpers
- `src/lib/api/auth.ts` - Authentication helpers
- Comentarios JSDoc en cada endpoint

---

## 📋 CHECKLIST FINAL

### Modo PARCIAL:

- [ ] `src/lib/api/responses.ts` creado
- [ ] `src/lib/api/auth.ts` creado
- [ ] `src/app/api/health/route.ts` creado
- [ ] Endpoint de ejemplo con patterns
- [ ] Verificar documentación (OpenAPI o código)

### Modo COMPLETO (adicional):

- [ ] Endpoints por dominio según SRS
- [ ] Schemas registrados en OpenAPI
- [ ] Stripe webhook configurado (si aplica)
- [ ] Cron endpoints configurados (si aplica)

### Validaciones:

- [ ] `bun run typecheck` pasa
- [ ] `/api/health` retorna status
- [ ] Endpoints protegidos requieren auth

---

## 🎉 REPORTE FINAL

```markdown
# ✅ API Routes Setup Completado

## Modo: [PARCIAL/COMPLETO]

## Estructura Creada:
```

src/app/api/
├── health/route.ts
├── openapi/route.ts (de openapi-setup)
└── [dominios según proyecto]

src/lib/api/
├── responses.ts
└── auth.ts

```

## Endpoints Implementados:
| Method | Path | Auth |
|--------|------|------|
| GET | /api/health | No |
[Listar todos]

## Patterns Establecidos:
- ✅ Validación con Zod
- ✅ Error handling centralizado
- ✅ Auth helper para endpoints protegidos
- ✅ Integración con Supabase

## Próximos Pasos:
1. Implementar endpoints específicos del negocio
2. Registrar en OpenAPI (si aplica)
3. Agregar tests de API
```

---

## ❓ PREGUNTAS FRECUENTES

**P: ¿Debo crear un endpoint para cada operación CRUD?**
R: No necesariamente. Si Supabase REST API cubre tus necesidades, úsalo directamente. Crea endpoints custom solo para lógica compleja.

**P: ¿Cuándo usar endpoints custom vs Supabase directo?**
R: Usa endpoints custom para:

- Integración con servicios externos (Stripe, email)
- Lógica de negocio compleja
- Operaciones que tocan múltiples tablas
- Webhooks
- Cron jobs

**P: ¿Cómo pruebo endpoints protegidos?**
R: Opciones:

1. Login via web → copiar cookie → usar en Postman
2. Crear endpoint de testing con API key
3. Usar Playwright con login automatizado

**P: ¿Puedo ejecutar este prompt de nuevo?**
R: Sí. Detectará la estructura existente y agregará nuevos endpoints sin sobrescribir.

---

## 🔗 INTEGRACIÓN CON OTROS FEATURES

### Con `openapi-setup`:

Los endpoints se pueden registrar automáticamente si creas schemas en `src/lib/openapi/schemas/`.

### Con `supabase-types-setup`:

Usa los tipos de `@/types/supabase` para type-safety en queries:

```typescript
import type { Database } from '@/types/supabase';
type Example = Database['public']['Tables']['examples']['Row'];
```

### Con `env-url-setup`:

Usa `buildUrl()` para generar URLs de callback:

```typescript
import { buildUrl } from '@/lib/urls';
const callbackUrl = buildUrl('/api/stripe/webhook');
```
