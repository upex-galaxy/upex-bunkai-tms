# OpenAPI and Zod setup

Phase 3 (infrastructure) add-on of `project-bootstrap`. It gives the app one source for its API documentation: a Zod-based OpenAPI registry, a `/api/openapi` endpoint that serves the spec as JSON, and a `/api/docs` page that renders the spec with Scalar (a Next.js route handler). The auth methods live in the spec (`info.description` plus `securitySchemes`), and Scalar renders them natively, so there are no custom React components.

The add-on is done when `/api/openapi` returns valid JSON, `/api/docs` renders the endpoints and the auth section outside production, and the checklist at the end is ticked.

## Read the `stack:` block first

The add-on runs the same way on a greenfield project and on an existing app (verdict `existing-app` of the entry guard, `SKILL.md` Phase 3). Before the first step, read `.agents/project.yaml` `stack:` (contract: `.agents/README.md`, section `stack`) and resolve every literal in this file against it.

- The example paths (`src/app/api/`, `src/lib/supabase/`, `src/types/supabase.ts`) are the greenfield defaults. Resolve them under `{{stack.app_root}}`. The generated types file is `{{stack.database.types_path}}`. With `stack.framework: nextjs-pages` the API lives in `pages/api/`.
- App commands are `{{stack.package_manager}} run <script>`, with the script NAME taken from `stack.scripts`. A script set to `null` is skipped and the report says so; do not invent one. Install dependencies with that package manager and do not switch it.
- What the app already has wins. An existing docs UI, error contract, auth scheme, Supabase client location or major version of a dependency (Zod, Next) is read and extended, never replaced or upgraded by this add-on. When the app and this file disagree, show the user both shapes (see "With nobody at the keyboard").
- The Supabase project ref is `environments.<env>.db_project_ref`. Any touch to the database follows `agentic-dev-core/references/db-change-doctrine.md`.

## Inputs

Read these files:

- `.context/PRD/executive-summary.md` for the project name and description.
- `.agents/project.yaml` `environments.<env>.db_project_ref` (`{{DB_PROJECT_REF}}` of the active environment) for the Supabase project ref.
- `src/lib/config.ts` for the existing configuration.
- `src/lib/urls.ts` for the URLs per environment, if it exists.
- `src/app/api/` for the existing endpoints, if any.
- `package.json` for the current dependencies.

Extract three things: the project name (the API title), the Supabase project ID (the auth cookie name) and the environment URLs (the `servers` of the spec).

Tools: the Context7 MCP, to confirm dependency versions. Dependencies to install:

```bash
bun add @asteasolutions/zod-to-openapi zod
```

## Mode detection

Run the analysis to pick the mode:

```bash
# Check for custom endpoints
ls -la src/app/api/ 2>/dev/null | grep -v "openapi" | wc -l

# Check whether an OpenAPI structure already exists
ls -la src/lib/openapi/ 2>/dev/null
```

| Condition                                     | Mode         |
| --------------------------------------------- | ------------ |
| No `src/app/api/`, or it only has openapi     | **PARTIAL**  |
| Custom endpoints exist in `src/app/api/`      | **FULL**     |

PARTIAL mode creates:

- `src/lib/openapi/`: `registry.ts`, `index.ts`, `schemas/common.ts`, `schemas/index.ts`.
- `src/app/api/openapi/route.ts`, the GET endpoint.
- `src/app/api/docs/route.ts`, the Scalar route handler. It is one file and serves the UI from the spec. Scalar replaces the bespoke Redoc page and components: the multi-spec selector (`sources` config) and the auth panel (`info.description` and `securitySchemes`) come built in.
- Generic info only, with no domain schemas.

FULL mode adds:

- Domain types in `src/types/`, the source of truth: `[domain].ts` with Zod schemas using `.openapi()` plus the inferred types, and validation helpers for the API routes.
- Path registrations in `src/lib/openapi/schemas/`: `[domain].ts` with only `registry.registerPath()`, importing from `@/types`.
- Every existing endpoint registered, and auth documented in `info.description` plus the registry `securitySchemes`, which Scalar renders at `/api/docs`.

## Single source of truth

Define each schema once, in `src/types/`, and let the OpenAPI registry import it. The reason: if the TypeScript types and the OpenAPI schemas are two definitions, adding a field means editing both, and the documentation drifts the first time someone forgets one.

Wrong:

```
src/types/user.ts                 →  defines TypeScript types
src/lib/openapi/schemas/users.ts  →  defines separate Zod schemas (DUPLICATE)

Result: adding a field means updating BOTH files.
        Forget one and the documentation drifts.
```

Right:

```
src/types/user.ts                 →  defines Zod schemas with .openapi() and generates the types
src/lib/openapi/schemas/users.ts  →  only imports and registers paths (defines NO schemas)

Result: changing the types changes the OpenAPI spec.
        The two cannot drift.
```

File layout:

```
src/types/                          ← SOURCE OF TRUTH (Zod schemas + types)
├── user.ts                         ← UserSchema.openapi('User') + type User
├── booking.ts                      ← BookingSchema.openapi('Booking') + type Booking
├── communication.ts                ← ChannelSchema.openapi('Channel') + type Channel
└── index.ts                        ← Barrel export

src/lib/openapi/
├── registry.ts                     ← Central configuration
├── index.ts                        ← Entry point
└── schemas/
    ├── common.ts                   ← Generic schemas (ErrorResponse, UUID, etc.)
    ├── users.ts                    ← Only registry.registerPath(), imports from @/types
    ├── bookings.ts                 ← Only registry.registerPath(), imports from @/types
    └── index.ts                    ← Barrel export
```

Worked example. The schema and its inferred type live in `src/types/`:

```typescript
// CORRECT: src/types/communication.ts (SOURCE OF TRUTH)
import { z } from '@/lib/openapi/zod'; // single extended instance: never import from 'zod' if you use .openapi()

// Schema with OpenAPI metadata
export const CommunicationChannelSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(['zoom', 'google_meet', 'phone', 'whatsapp']),
    handle: z.string().nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .openapi('CommunicationChannel');

// Type inferred AUTOMATICALLY (always in sync)
export type CommunicationChannel = z.infer<typeof CommunicationChannelSchema>;

// Schema for input (create/update)
export const ChannelInputSchema = CommunicationChannelSchema.omit({ id: true }).openapi(
  'ChannelInput'
);
export type ChannelInput = z.infer<typeof ChannelInputSchema>;

// Validation helper for API routes
export function isValidChannelType(type: string): boolean {
  return ['zoom', 'google_meet', 'phone', 'whatsapp'].includes(type);
}
```

The path file only registers paths:

```typescript
// CORRECT: src/lib/openapi/schemas/users.ts (ONLY REGISTERS PATHS)
import { registry } from '../registry';
import { z } from '../zod'; // single extended instance
import { CommunicationChannelSchema, ChannelInputSchema } from '@/types/communication'; // ← imports from types, does NOT define here
import { ErrorResponseSchema } from './common';

// Registers the PATH only, defines no new schemas
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
            channels: z.array(ChannelInputSchema), // ← uses the imported schema
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
            channels: z.array(CommunicationChannelSchema), // ← uses the imported schema
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
// WRONG: duplicates the schema
// src/lib/openapi/schemas/users.ts
export const ChannelSchema = z
  .object({
    // ← DUPLICATE of src/types/communication.ts
    type: z.enum(['zoom', 'google_meet']),
    handle: z.string(),
  })
  .openapi('Channel');
```

With this layout a new field is one edit:

```typescript
// src/types/communication.ts - add the "priority" field
export const ChannelInputSchema = z.object({
  type: CommunicationChannelTypeSchema,
  handle: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  priority: z.number().optional().default(0).openapi({
    // ← NEW
    description: 'Display priority (higher = first)',
  }),
});

// Updated automatically:
// - TypeScript types
// - Runtime validation
// - OpenAPI spec
// - Documentation at /api/docs
```

### Relation to the generated Supabase types

`src/types/` holds two families of types. They do not collide, but the boundary matters.

| Family | Origin | Naming | Role |
| --- | --- | --- | --- |
| `Database` (`supabase.ts`) | generated by `supabase gen types` (supabase-types-setup) | **snake_case** (`user_id`, `created_at`), mirrors the DB columns | Truth for the **DB row** (Supabase client queries) |
| Zod schemas (`booking.ts`, etc.) | hand-written with `.openapi()` | usually **camelCase** (`userId`, `createdAt`) | Truth for the **API contract** (validation plus OpenAPI) |

- The API payload (request and response) is defined by the Zod schema in `src/types/`, the single source for the contract and the OpenAPI spec.
- The DB row is defined by the generated `Database`, the single source for data access.
- The route handler is the mapping point: it validates with Zod, queries with the `Database` types, and maps snake_case to camelCase explicitly. Do not derive one family from the other blindly.
- To avoid naming drift, pick ONE convention per project and document it: (a) Zod schemas in snake_case to match the DB (less mapping, a less idiomatic contract), or (b) camelCase in the API plus a mapping function.

## Steps

### Phase 0: analysis and preparation

**Step 0.1: detect the mode**

```bash
# Count endpoints (excluding openapi)
ENDPOINT_COUNT=$(find src/app/api -name "route.ts" 2>/dev/null | grep -v "openapi" | wc -l)

if [ "$ENDPOINT_COUNT" -gt "0" ]; then
  echo "Mode: FULL ($ENDPOINT_COUNT endpoints found)"
else
  echo "Mode: PARTIAL (no custom endpoints)"
fi
```

**Step 0.2: extract the project information**

```bash
# Project name
grep -i "title\|name\|proyecto" .context/PRD/executive-summary.md | head -3

# Supabase project ref (`.agents/instructions/agent-project-variables.md` §7: the project identity lives in the yaml)
yq '.environments.<env>.db_project_ref' .agents/project.yaml
```

Keep two values:

- `PROJECT_NAME`, the API title.
- `SUPABASE_PROJECT_ID`, for the cookie name. It is the 20-character ref. If the yaml has `null`, ask the user and write the answer there once they confirm.

**Step 0.3: check the URLs**

```bash
# If urls.ts exists, use it
cat src/lib/urls.ts 2>/dev/null | grep -E "staging|production"
```

If `src/lib/urls.ts` does not exist, ask the user for the URLs.

### Phase 1: install dependencies

**Step 1.1: check what is already installed**

```bash
grep -E "zod|openapi|@scalar" package.json
```

**Step 1.2: install what is missing**

```bash
# Query Context7 first for the latest versions.
# Spec generation (UI-agnostic): Zod v4 + zod-to-openapi v8 (the supported pairing):
bun add zod@^4 @asteasolutions/zod-to-openapi@^8
# Documentation UI (Scalar, route handler for the Next.js App Router):
bun add @scalar/nextjs-api-reference
```

Query Context7 first for the latest versions. `@asteasolutions/zod-to-openapi` v8.x supports Zod 4.x. A project pinned to Zod 3 uses `@asteasolutions/zod-to-openapi@7.3.4` (the v3 branch, no longer actively supported) and the legacy syntax `z.email()/.uuid()/.datetime()`. This file uses the Zod v4 syntax (`z.email()`, `z.uuid()`, `z.iso.datetime()`, `error.issues`).

Older `@scalar/nextjs-api-reference` releases (below 0.5) pinned `next@^14`. If `bun add` reports a peer conflict, install `@latest` and confirm the version.

Verify the install:

```bash
bun pm ls | grep -E "zod|openapi|@scalar"
```

### Phase 2: create the OpenAPI structure

**Step 2.1: create the directory and the single Zod instance**

```bash
mkdir -p src/lib/openapi/schemas
```

`extendZodWithOpenApi` mutates the Zod singleton. If some files import `z` from `'zod'` and others extend it separately, a module that calls `.openapi()` can load BEFORE `extendZodWithOpenApi` runs, and `.openapi` is `undefined` at runtime. The fix is ONE module that extends and re-exports `z`; every file that uses `.openapi()` imports `z` from there, never from `'zod'`.

```typescript
// src/lib/openapi/zod.ts: the single Zod instance, extended with OpenAPI.
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export { z };
```

**Step 2.2: create `registry.ts`**

```typescript
// src/lib/openapi/registry.ts

/**
 * OpenAPI Registry Configuration
 *
 * Central configuration for generating OpenAPI documentation
 * from Zod schemas. This is the source of truth for the API spec.
 */

import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from './zod'; // single instance, already extended with .openapi()

// Create the registry instance
export const registry = new OpenAPIRegistry();

// ============================================================================
// Security Schemes
// ============================================================================

// Cookie-based authentication (Supabase session)
registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'sb-[SUPABASE_PROJECT_ID]-auth-token', // Replace with the real ID
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
  // 3.0.3 works with Scalar. Optional: for OpenAPI 3.1 (closer to
  // JSON Schema / Zod v4) use `OpenApiGeneratorV31` + `openapi: '3.1.0'`.
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: '[PROJECT_NAME] - API', // Replace
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

URLs per environment are resolved from \`src/lib/urls.ts\` (env-url-setup) or \`.agents/project.yaml\`. They are never hardcoded here (anti-pattern B4).
      `.trim(),
      contact: {
        name: 'Development Team',
        url: '[REPO_URL]',
      },
    },
    // ANTI-PATTERN B4: do not hardcode URLs or placeholders. Derive them from the environment.
    // Preferred (if you ran env-url-setup): import { getBaseUrl } from '@/lib/urls'
    //   → url: `${getBaseUrl()}/api`
    // Fallback without env-url-setup: read from .agents/project.yaml / env.
    servers: [
      {
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api`,
        description: 'Current environment',
      },
    ],
    tags: [
      // Add tags per project domain
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

Replace every placeholder before moving on: `[SUPABASE_PROJECT_ID]`, `[PROJECT_NAME]` and `[REPO_URL]`.

**Step 2.3: create `index.ts`**

```typescript
// src/lib/openapi/index.ts

export { registry, generateOpenAPIDocument, z } from './registry';
export * from './schemas';
```

**Step 2.4: create `schemas/common.ts`**

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

**Step 2.5: create `schemas/index.ts`**

```typescript
// src/lib/openapi/schemas/index.ts

export * from './common';
// Add more exports as domain schemas are created
```

### Phase 3: create the `/api/openapi` endpoint

**Step 3.1: create the directory**

```bash
mkdir -p src/app/api/openapi
```

**Step 3.2: create `route.ts`**

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

### Phase 4: create the `/api/docs` route (Scalar)

Scalar mounts as a Next.js App Router route handler: one file, no page and no React components. It serves the interactive UI from the spec at `/api/openapi`, behind an environment gate (404 in production).

**Step 4.1: create the route handler**

```bash
mkdir -p "src/app/api/docs"
```

```typescript
// src/app/api/docs/route.ts

import { ApiReference } from "@scalar/nextjs-api-reference";

// 404 in production: the API docs are not exposed publicly.
function isAllowedEnvironment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) {
    // On Vercel: allow preview (staging), block production
    return vercelEnv !== "production";
  }
  // Local: allow development only
  return process.env.NODE_ENV === "development";
}

// ApiReference(config) returns a handler () => Response (NO arguments).
const handler = ApiReference({
  // Scalar's native multi-document support. The first one (or `default: true`) is active.
  sources: [
    { title: "Next.js API", slug: "nextjs", url: "/api/openapi", default: true },
    // Optional: Supabase REST (the publishable key is public by design):
    // {
    //   title: "Supabase REST",
    //   slug: "supabase",
    //   url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/?apikey=${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
    // },
  ],
  theme: "purple", // match the brand (Redoc used #7c3aed)
  pageTitle: "[PROJECT_NAME] — API Reference",
});

export async function GET(): Promise<Response> {
  if (!isAllowedEnvironment()) {
    return new Response(null, { status: 404 });
  }
  return handler();
}
```

Three notes on this handler:

- Auth in the UI: Scalar renders the auth methods from the spec's `info.description` plus its `securitySchemes` (defined in `src/lib/openapi/registry.ts`, Phase 2). No separate auth panel is needed.
- Multi-spec: to expose the Supabase REST API too, uncomment the second `source`; Scalar shows a native document selector. Confirm through Context7 that the installed `@scalar/nextjs-api-reference` supports `sources`. If it does not, mount a second route at `src/app/api/docs/supabase/route.ts` with its own `url`.
- Use `new Response(null, { status: 404 })` for the gate. `notFound()` belongs to RSC and pages, not to route handlers.

Migrating from Redoc: delete the old `auth-info-panel.tsx`, `redoc-viewer.tsx`, `api-doc-selector.tsx`, `page.tsx` and the `(minimal)/layout.tsx`. The auth information (Supabase session cookie `sb-[SUPABASE_PROJECT_ID]-auth-token`, `Authorization: Bearer`, `X-API-Key`, `CRON_SECRET`) now lives in the registry `securitySchemes` (Phase 2) plus `info.description`, and Scalar renders it at `/api/docs`. Replace `[SUPABASE_PROJECT_ID]` wherever it appears in `registry.ts`.

**Step 4.2: when migrating an existing project, remove Redoc**

```bash
# Delete the old Redoc implementation if it exists
rm -rf "src/app/(minimal)/api-docu"
# Delete the minimal layout ONLY if no other page uses it
[ -z "$(ls -A 'src/app/(minimal)' 2>/dev/null)" ] && rm -f "src/app/(minimal)/layout.tsx" && rmdir "src/app/(minimal)" 2>/dev/null || true
```

### Phase 5 (FULL mode): domain schemas with a single source of truth

Run this phase only when custom endpoints exist. Define the domain schemas in `src/types/`, never in `src/lib/openapi/schemas/` (see "Single source of truth" above).

**Step 5.1: analyze the existing endpoints and types**

```bash
# List existing endpoints
find src/app/api -name "route.ts" | grep -v "openapi"

# List existing types (they may already have Zod schemas)
ls src/types/
```

**Step 5.2: create or update the schema in `src/types/`**

For each domain found (users, bookings, payments, ...), write the schema in `src/types/`:

```typescript
// src/types/booking.ts (SOURCE OF TRUTH)

import { z } from '@/lib/openapi/zod'; // single extended instance: never import from 'zod' if you use .openapi()

// ============================================================================
// SCHEMAS (with OpenAPI metadata)
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

// Input schemas (omit autogenerated fields)
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
// INFERRED TYPES (always in sync with the schemas)
// ============================================================================

export type BookingStatus = z.infer<typeof BookingStatusSchema>;
export type Booking = z.infer<typeof BookingSchema>;
export type CreateBooking = z.infer<typeof CreateBookingSchema>;
export type UpdateBooking = z.infer<typeof UpdateBookingSchema>;

// ============================================================================
// VALIDATION HELPERS (for use in API routes)
// ============================================================================

export function isValidBookingStatus(status: string): status is BookingStatus {
  return BookingStatusSchema.safeParse(status).success;
}
```

**Step 5.3: register the paths in `src/lib/openapi/schemas/`**

Create the file that ONLY registers paths, importing the schemas from `@/types`:

```typescript
// src/lib/openapi/schemas/bookings.ts (PATHS ONLY, NO SCHEMAS)

import { registry } from '../registry';
import { z } from '../zod'; // single extended instance
import { BookingSchema, CreateBookingSchema, UpdateBookingSchema } from '@/types/booking'; // ← imports from types
import { ErrorResponseSchema, UUIDSchema } from './common';

// ============================================================================
// REGISTER PATHS (do not define schemas here)
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
            data: z.array(BookingSchema), // ← uses the imported schema
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
        'application/json': { schema: CreateBookingSchema }, // ← uses the imported schema
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
        'application/json': { schema: UpdateBookingSchema }, // ← uses the imported schema
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

**Step 5.4: update the barrel**

```typescript
// src/lib/openapi/schemas/index.ts

export * from './common';
export * from './bookings'; // Exports the path registrations only
// Add more as they are created
```

**Step 5.5: check for duplication**

```bash
# Look for duplicated schemas (there should be NO .openapi() in lib/openapi/schemas/)
grep -r "\.openapi\(" src/lib/openapi/schemas/ --include="*.ts" | grep -v "common.ts"

# If it finds anything, move those schemas to src/types/
```

A hit means that schema is duplicated. Move it to `src/types/` and import it from there.

### Phase 6: validation

**Step 6.1: TypeScript check**

```bash
bun run types:check
```

**Step 6.2: check the endpoint**

```bash
bun run dev &
sleep 3
curl -s http://localhost:3000/api/openapi | jq '.info.title'
```

Expected output: the project title you configured.

**Step 6.3: check the UI**

1. Open `http://localhost:3000/api/docs`.
2. Confirm Scalar loads and renders the endpoints from the spec.
3. Confirm the authentication section (from `securitySchemes` plus `info.description`) appears.
4. If you enabled multi-spec, confirm Scalar's Next.js / Supabase document selector.

## Checklist

PARTIAL mode:

- [ ] `src/lib/openapi/registry.ts` created with the project info
- [ ] `src/lib/openapi/index.ts` created
- [ ] `src/lib/openapi/schemas/common.ts` created
- [ ] `src/lib/openapi/schemas/index.ts` created
- [ ] `src/app/api/openapi/route.ts` created
- [ ] `src/app/api/docs/route.ts` created (Scalar route handler)
- [ ] `@scalar/nextjs-api-reference` installed
- [ ] `/api/openapi` returns valid JSON
- [ ] `/api/docs` renders Scalar (404 in production)
- [ ] Auth visible in the UI (from `securitySchemes` + `info.description`)

FULL mode, in addition:

- [ ] Domain schemas created in `src/types/` (with `.openapi()`)
- [ ] Types inferred with `z.infer<>` in `src/types/`
- [ ] Path registrations in `src/lib/openapi/schemas/` (they only import from `@/types`)
- [ ] Endpoints registered in OpenAPI
- [ ] Tags configured per domain
- [ ] No duplicated schemas (check with `grep -r "\.openapi\(" src/lib/openapi/schemas/`)

## Final report

Write the report in English:

```markdown
# OpenAPI setup completed

## Mode: [PARTIAL/FULL]

## Files created:

### OpenAPI core:

- src/lib/openapi/registry.ts
- src/lib/openapi/index.ts
- src/lib/openapi/schemas/common.ts
- src/lib/openapi/schemas/index.ts

### Endpoint:

- src/app/api/openapi/route.ts

### UI (Scalar):

- src/app/api/docs/route.ts

## Available URLs:

- `/api/openapi` - JSON spec for tools
- `/api/docs` - interactive Scalar UI (dev/staging only)

## Next steps:

1. When you create new endpoints:
   - Define the Zod schemas in `src/types/[domain].ts` with `.openapi()`
   - Register the paths in `src/lib/openapi/schemas/[domain].ts`
   - Never duplicate schemas: always import from `@/types`
2. When you add an auth method, register it in the registry `securitySchemes` plus `info.description` (Scalar shows it automatically at `/api/docs`)

## Single source of truth pattern:

- Schemas in `src/types/` give types, validation and OpenAPI
- Paths in `src/lib/openapi/schemas/` only call `registerPath()`
- No schemas are defined in `src/lib/openapi/schemas/`
```

## With nobody at the keyboard

A supervised worker sends these questions to its conductor, which holds the gate. A routine with nobody takes the paths below (`agentic-dev-core/references/decision-protocol.md` §5.2).

- Environment URLs missing (Step 0.3): do not ask. Keep the `servers` fallback from Step 2.2 (`NEXT_PUBLIC_APP_URL`, then `http://localhost:3000`) and list the missing URLs in the report.
- `db_project_ref` is `null` (Step 0.2): do not write the project identity into `.agents/project.yaml`, which is the human's call. Generate the files with `[SUPABASE_PROJECT_ID]` still in place and put "cookie name unresolved" at the top of the report, so nobody mistakes the spec for finished.
- The app and this file disagree (docs UI, error contract, auth scheme, major version): the app's form wins, as the `stack:` section says. Extend it, do not replace it, and report both shapes.

## Questions that come up

**Why does `/api/docs` return 404 in production?** On purpose: API documentation is not exposed publicly. The Scalar route handler runs `isAllowedEnvironment()` and returns `new Response(null, { status: 404 })` in production. It is available in development and staging.

**How do I register a new endpoint?** Define the schema in `src/types/`, then register the path:

```typescript
// 1. src/types/user.ts (FIRST - define the schema)
export const UserSchema = z.object({...}).openapi('User');
export type User = z.infer<typeof UserSchema>;

// 2. src/lib/openapi/schemas/users.ts (THEN - register the path)
import { UserSchema } from '@/types/user';

registry.registerPath({
  method: 'post',
  path: '/users',
  tags: ['Users'],
  request: { body: { content: { 'application/json': { schema: UserSchema } } } },
  // ...
});
```

**Why can I not define schemas in `src/lib/openapi/schemas/`?** Two definitions drift apart: add a field in one and forget the other. With one source, a single edit updates types, validation and the spec.

**What if I already have duplicated schemas?** Move them to `src/types/`:

```bash
# Find duplicated schemas
grep -r "\.openapi\(" src/lib/openapi/schemas/ --include="*.ts" | grep -v "common.ts"

# For each one found:
# 1. Move the schema to src/types/[domain].ts
# 2. Change the import in src/lib/openapi/schemas/[domain].ts
# 3. Delete the duplicate definition
```

**Can I run this add-on again?** Yes. When the structure exists it switches to FULL mode and analyzes new endpoints to register.

**Does it work with Stripe webhooks?** Yes. Add a security scheme for `Stripe-Signature` and register it on the webhook endpoints.

**How do I know the spec is in sync with the types?** With the single-source pattern it always is, because both come from the same file. Check with the same grep as above; it should find nothing outside `common.ts`:

```bash
# Should find nothing (except common.ts)
grep -r "\.openapi\(" src/lib/openapi/schemas/ --include="*.ts" | grep -v "common.ts"
```
