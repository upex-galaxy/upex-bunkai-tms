# API routes setup

Phase 3 (infrastructure) add-on of `project-bootstrap`. It creates the base structure for custom API endpoints in Next.js: routes organized by domain, Zod validation patterns, standardized error handling, Supabase integration and, optionally, registration in OpenAPI.

The add-on is done when the helpers and the example endpoints exist, `bun run types:check` passes, `/api/health` answers, and protected endpoints require auth (see the checklist).

## Read the `stack:` block first

The add-on runs the same way on a greenfield project and on an existing app (verdict `existing-app` of the entry guard, `SKILL.md` Phase 3). Before the first step, read `.agents/project.yaml` `stack:` (contract: `.agents/README.md`, section `stack`) and resolve every literal in this file against it.

- The example paths (`src/app/api/`, `src/lib/supabase/`, `src/types/supabase.ts`) are the greenfield defaults. Resolve them under `{{stack.app_root}}`. The generated types file is `{{stack.database.types_path}}`. With `stack.framework: nextjs-pages` the API lives in `pages/api/`.
- App commands are `{{stack.package_manager}} run <script>`, with the script NAME taken from `stack.scripts`. A script set to `null` is skipped and the report says so; do not invent one. Install dependencies with that package manager and do not switch it.
- What the app already has wins. An existing docs UI, error contract, auth scheme, Supabase client location or major version of a dependency (Zod, Next) is read and extended, never replaced or upgraded by this add-on. When the app and this file disagree, show the user both shapes (see "With nobody at the keyboard").
- The Supabase project ref is `environments.<env>.db_project_ref`. Any touch to the database follows `agentic-dev-core/references/db-change-doctrine.md`.

## Inputs

Read these files:

- `.context/SRS/functional-specs.md` for the functional requirements.
- `.context/SRS/architecture-specs.md` for the architecture and the planned endpoints.
- `.context/PRD/mvp-scope.md` for the MVP features.
- `src/lib/supabase/server.ts` for the existing server client.
- `src/lib/openapi/`, the OpenAPI system, if it exists.

Extract three things: the project domains (to organize the endpoints), the endpoints the SRS and the MVP scope call for, and the integrations (Stripe, email, and so on).

Tools: the Context7 MCP, to confirm the Next.js APIs. Dependencies that must already be present: `zod` (validation) and `@supabase/ssr` (auth).

## Mode detection

Run the analysis to pick the mode:

```bash
# Check whether the OpenAPI setup exists
ls -la src/lib/openapi/registry.ts 2>/dev/null

# Check the SRS for planned endpoints
grep -i "endpoint\|api\|route" .context/SRS/functional-specs.md | head -10
```

| Condition                                           | Mode         |
| --------------------------------------------------- | ------------ |
| No detailed SRS, or few planned endpoints           | **PARTIAL**  |
| SRS with defined endpoints plus an existing OpenAPI | **FULL**     |

PARTIAL mode creates, under `src/app/api/`:

- The folder structure by domain.
- An example endpoint with validation.
- The error-handling utilities.
- The patterns documented in code. With OpenAPI present, endpoints appear in `/api/docs` (Scalar).

FULL mode adds:

- Endpoints according to the SRS, every domain implemented.
- Zod schemas registered in OpenAPI, by domain.

## Steps

### Phase 0: analysis

**Step 0.1: identify the domains**

Read `.context/SRS/` and `.context/PRD/` to identify the main domains. Typical ones:

- `auth`: custom authentication
- `users`: user management
- `stripe`: payments (webhook, checkout, connect)
- `email`: sending email
- `cron`: scheduled jobs
- `[project-specific domain]`, according to the project

**Step 0.2: check for OpenAPI**

```bash
ls -la src/lib/openapi/registry.ts 2>/dev/null && echo "OpenAPI exists" || echo "No OpenAPI"
```

If OpenAPI exists, Phase 4 registers the endpoints in it.

### Phase 1: create the folder structure

**Step 1.1: recommended structure**

```bash
mkdir -p src/app/api
```

Structure by domain:

```
src/app/api/
├── openapi/
│   └── route.ts              # (From openapi-setup)
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
└── [domain]/
    ├── route.ts              # Collection: GET (list), POST (create)
    └── [id]/
        └── route.ts          # Item: GET, PATCH, DELETE
```

### Phase 2: create the API utilities

**Step 2.1: response helpers**

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

**Step 2.2: auth helper**

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

### Phase 3: create the example endpoints

**Step 3.1: health check**

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

**Step 3.2: endpoint with validation (full example)**

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
// PARTIAL (no OpenAPI): a local schema, as here.
// FULL (with OpenAPI): do NOT redefine it. Import it from @/types/example (single
// source of truth): `import { CreateExampleSchema } from '@/types/example'`.

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
      // Zod v4: use `.issues` (`.errors` was removed; `.issues` works in v3 and v4)
      const firstError = validation.error.issues[0];
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

### Phase 4 (FULL mode): OpenAPI integration

Run this phase only if `openapi-setup` has been executed.

**Step 4.1: define the schema in `src/types/` and register the path**

The schema lives in `src/types/` (single source of truth, see `openapi-setup.md`, section "Single source of truth"), never in `src/lib/openapi/schemas/`, which only registers paths. The route handler (`route.ts`) and the path registration import the SAME schema from `@/types`.

```typescript
// src/types/example.ts (SOURCE OF TRUTH)
import { z } from '@/lib/openapi/zod'; // single extended instance: never 'zod' if you use .openapi()

export const ExampleSchema = z
  .object({
    id: z.uuid(),
    user_id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    created_at: z.iso.datetime(),
  })
  .openapi('Example');
export type Example = z.infer<typeof ExampleSchema>;

export const CreateExampleSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
  })
  .openapi('CreateExample');
export type CreateExample = z.infer<typeof CreateExampleSchema>;
```

```typescript
// src/lib/openapi/schemas/example.ts (ONLY REGISTERS PATHS)

import { registry } from '../registry';
import { z } from '../zod';
import { ExampleSchema, CreateExampleSchema } from '@/types/example'; // ← imports from types, does NOT define here

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

**Step 4.2: update the barrel export**

```typescript
// src/lib/openapi/schemas/index.ts

export * from './common';
export * from './example'; // Add
```

### Phase 5 (FULL mode): endpoints from the SRS

For each domain identified in Phase 0:

1. Create the folder `src/app/api/[domain]/`.
2. Create `route.ts` with the collection operations (GET list, POST create).
3. Create `[id]/route.ts` with the item operations (GET, PATCH, DELETE).
4. With OpenAPI present, register the schemas and endpoints.

Pattern for a Stripe webhook:

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

Pattern for a cron job:

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

### Phase 6: check the documentation

Endpoint documentation is automatic:

- Endpoints: if you ran `openapi-setup.md`, they are documented at `/api/docs` (Scalar UI).
- Authentication: documented in `.context/api-auth.md` (generated by `backend-setup.md`).

**Step 6.1: check the OpenAPI integration**

With OpenAPI configured, endpoints whose schemas are registered in `src/lib/openapi/schemas/` appear in the interactive documentation.

```bash
# Check that the documentation updates
curl http://localhost:3000/api/openapi | jq '.paths | keys'
```

**Step 6.2: patterns documented in code**

The API patterns are documented in the code itself:

- `src/lib/api/responses.ts`: error-handling helpers
- `src/lib/api/auth.ts`: authentication helpers
- JSDoc comments on every endpoint

## Checklist

PARTIAL mode:

- [ ] `src/lib/api/responses.ts` created
- [ ] `src/lib/api/auth.ts` created
- [ ] `src/app/api/health/route.ts` created
- [ ] Example endpoint with the patterns
- [ ] Documentation checked (OpenAPI or code)

FULL mode, in addition:

- [ ] Endpoints per domain according to the SRS
- [ ] Schemas registered in OpenAPI
- [ ] Stripe webhook configured (if it applies)
- [ ] Cron endpoints configured (if they apply)

Validations:

- [ ] `bun run types:check` passes
- [ ] `/api/health` returns the status
- [ ] Protected endpoints require auth

## Final report

Write the report in English. The template is a four-backtick block because it contains a fenced tree:

````markdown
# API routes setup completed

## Mode: [PARTIAL/FULL]

## Structure created:

```
src/app/api/
├── health/route.ts
├── openapi/route.ts (from openapi-setup)
└── [domains according to the project]

src/lib/api/
├── responses.ts
└── auth.ts
```

## Endpoints implemented:
| Method | Path | Auth |
|--------|------|------|
| GET | /api/health | No |
[List all of them]

## Patterns established:
- Validation with Zod
- Centralized error handling
- Auth helper for protected endpoints
- Supabase integration

## Next steps:
1. Implement the business-specific endpoints
2. Register them in OpenAPI (if it applies)
3. Add API tests
````

## With nobody at the keyboard

A supervised worker sends these questions to its conductor, which holds the gate. A routine with nobody takes the paths below (`agentic-dev-core/references/decision-protocol.md` §5.2).

- The app and this file disagree (error contract, auth scheme, Supabase client location, major version): the app's form wins, as the `stack:` section says. Extend it, do not replace it, and report both shapes.
- The SRS names no endpoints: run PARTIAL mode, which needs no decision, and say in the report that the SRS gave nothing to implement.

## Questions that come up

**Do I need an endpoint for every CRUD operation?** No. If the Supabase REST API covers the need, use it directly. Create custom endpoints for complex logic only.

**When do I use a custom endpoint instead of Supabase directly?** For:

- Integrations with external services (Stripe, email)
- Complex business logic
- Operations that touch several tables
- Webhooks
- Cron jobs

**How do I test protected endpoints?** Three options:

1. Log in through the web app, copy the cookie, and use it in Postman.
2. Create a testing endpoint with an API key.
3. Use Playwright with an automated login.

**Can I run this add-on again?** Yes. It detects the existing structure and adds new endpoints without overwriting.

## Related add-ons

With `openapi-setup`: endpoints are registered in OpenAPI when their schemas follow the single-source pattern (`src/types/` for the schema, `src/lib/openapi/schemas/` for the path).

With `supabase-types-setup`: use the types from `@/types/supabase` for type safety in queries:

```typescript
import type { Database } from '@/types/supabase';
type Example = Database['public']['Tables']['examples']['Row'];
```

With `env-url-setup`: use `buildUrl()` to generate callback URLs:

```typescript
import { buildUrl } from '@/lib/urls';
const callbackUrl = buildUrl('/api/stripe/webhook');
```
