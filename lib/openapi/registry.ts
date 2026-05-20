import {
  extendZodWithOpenApi,
  OpenApiGeneratorV31,
  OpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi';
import { APP_URLS } from '@lib/urls';
import { z } from 'zod';

// Single OpenAPI registry shared by every `route.openapi.ts` sibling. Per-route
// files import `registry` and call `registry.registerPath(...)` at module top
// so the spec and the handler shape stay colocated.
//
// `extendZodWithOpenApi` patches the global Zod `z` once so any `.openapi()`
// call (here or in `route.openapi.ts`) attaches metadata to the schema. We
// re-export the patched `z` for callers that prefer importing from this file.

extendZodWithOpenApi(z);

export { z };

export const registry = new OpenAPIRegistry();

// ---------------------------------------------------------------------------
// Reusable components — error envelope + security schemes.
// Registered at module load so per-route schemas can $ref them.
// ---------------------------------------------------------------------------

// Mirrors `lib/api/error-envelope.ts`. Keep the union of codes in sync.
const ApiErrorCodeSchema = z
  .enum([
    'bad_request',
    'validation_failed',
    'unauthorized',
    'forbidden',
    'not_found',
    'method_not_allowed',
    'conflict',
    'idempotency_key_required',
    'idempotency_key_invalid',
    'rate_limited',
    'internal_error',
    'upstream_error',
  ])
  .openapi({ description: 'Machine-readable error code. Branch on this value, not on `message`.' });

export const ErrorEnvelopeSchema = registry.register(
  'ErrorEnvelope',
  z
    .object({
      error: z.object({
        code: ApiErrorCodeSchema,
        message: z.string().openapi({ description: 'Human-readable error description.' }),
        details: z.unknown().optional().openapi({
          description: 'Optional structured details. For validation errors this is the ZodError issues array.',
        }),
        request_id: z.string().optional().openapi({
          description: 'Echoed `x-request-id`. Quote this in bug reports.',
        }),
      }),
    })
    .openapi({
      description: 'Canonical error envelope returned by every `/api/v1` route on failure.',
    }),
);

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  description:
    'Personal access token. Format: `bk_pat_<12-char-prefix>.<base64url-secret>`. Issue via `POST /api/v1/tokens`.',
});

registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'sb-fmbpikzpkafptqximhxn-auth-token',
  description:
    'Supabase session cookie. Set automatically after the magic-link callback in the web app. Used for browser-driven calls.',
});

// ---------------------------------------------------------------------------
// Document builder. Servers list pulls from `lib/urls.ts` (single source of
// truth for environment URLs) — do not redeclare them here.
// ---------------------------------------------------------------------------

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Bunkai TMS API',
      version: '0.1.0',
      description:
        'Bunkai TMS public API. Wraps Supabase auth, ATC authoring, and run execution behind a versioned `/api/v1` surface. Designed to be operated by humans, scripts, CI/CD, and AI agents.',
      contact: { name: 'Bunkai', url: 'https://bunkai.io' },
    },
    servers: [
      { url: APP_URLS.local, description: 'Local dev' },
      { url: APP_URLS.staging, description: 'Staging' },
      { url: APP_URLS.production, description: 'Production' },
    ],
    tags: [
      { name: 'Health', description: 'Service liveness probes.' },
      { name: 'Auth', description: 'Authentication and session bootstrap.' },
      { name: 'Tokens', description: 'Personal access token issuance and revocation.' },
    ],
  });
}
