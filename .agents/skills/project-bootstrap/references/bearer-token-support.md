# Bearer token support for API routes

This add-on adds Bearer token authentication to the Next.js API routes, so the same endpoints serve three kinds of caller:

- testers using Postman, Insomnia or curl;
- external clients (mobile apps, third-party services);
- standard OAuth/JWT flows.

Browser cookie authentication keeps working unchanged. The add-on is done when protected endpoints answer to both a cookie session and a Bearer token, rate limiting and secret rotation are in the same scaffold (B7), and the validation in Phase 4 passes.

## First, read the `stack:` block

This add-on runs the same on a greenfield project and on an existing app (the `existing-app` verdict of the entry gate, `SKILL.md` Phase 3). Before the first step, read `.agents/project.yaml` key `stack:` (contract: `.agents/README.md`, `stack`) and resolve with it everything this reference writes as a literal:

- The example paths (`src/app/api/`, `src/lib/supabase/`, `src/types/supabase.ts`) are the greenfield defaults. Resolve them under `{{stack.app_root}}`; the types file is `{{stack.database.types_path}}`; with `stack.framework: nextjs-pages` the API lives in `pages/api/`.
- App commands are `{{stack.package_manager}} run <script>` with the NAME from `stack.scripts`. A script set to `null` is skipped and the report says so; never invent one. Install dependencies with that package manager and do not change it.
- What the app already has wins: a docs UI, an error contract, an auth scheme, the location of the Supabase clients, or the major version of a dependency (Zod, Next). Read and extend them. Do not replace them or upgrade them from this add-on. When something clashes, show the user both forms.
- The Supabase project ref is `environments.<env>.db_project_ref`. Any touch to the database follows `agentic-dev-core/references/db-change-doctrine.md`.

## Inputs

Read:

- `.agents/project.yaml` key `environments.<env>.db_project_ref` (`{{DB_PROJECT_REF}}` of the active environment) for the Supabase project ref. The stack is in `.context/SRS/architecture-specs.md`.
- `src/lib/supabase/server.ts`: the current server client.
- `src/app/api/`: the existing endpoints.
- `src/lib/config.ts`: the Supabase configuration.

Extract the Supabase URL (to create a client with the token), the publishable key (for authentication) and the existing endpoints (to update them).

Tools and dependencies: the Context7 MCP verifies the Supabase and Next.js APIs. `@supabase/supabase-js` creates the client with the token, and `@supabase/ssr` is already there for the SSR client. Check both are installed.

## Mode detection

Run these to learn the current state:

```bash
# Check whether Bearer token support already exists
grep -r "createServerFromRequest\|Authorization.*Bearer" src/lib/supabase/ src/app/api/ 2>/dev/null

# Count endpoints that use createServer
grep -r "createServer()" src/app/api/ --include="*.ts" | wc -l

# Check the structure of server.ts
cat src/lib/supabase/server.ts | head -20
```

| Condition                              | Mode                |
| -------------------------------------- | ------------------- |
| `createServerFromRequest` already exists | **ALREADY IMPLEMENTED** (report it and stop) |
| Only `createServer` (cookies) exists   | **IMPLEMENT**       |
| `src/lib/supabase/server.ts` is missing | **CREATE EVERYTHING** |

## Output

Core, in `src/lib/supabase/`: `server.ts` gets `createServerFromRequest()` with dual support.

Shared auth helper, if it exists (from `api-routes-setup`): `src/lib/api/auth.ts` (`getAuthenticatedUser` and `requireAuth`) is updated to receive `request` and use `createServerFromRequest`.

API routes, in `src/app/api/`: every protected endpoint uses `createServerFromRequest` (or the updated helper) and passes `request`.

Documentation, if OpenAPI or `/api/docs` exists: the Bearer `securitySchemes` entry is registered in `src/lib/openapi/registry.ts` and described in `info.description` (Scalar renders it at `/api/docs`).

## Steps

### Phase 0: Analyse the project

Step 0.1: check the current state.

```bash
# Check whether support already exists
grep -l "createServerFromRequest" src/lib/supabase/server.ts 2>/dev/null && echo "Already supported" || echo "Needs implementation"
```

Step 0.2: list the endpoints to update.

```bash
# Find every endpoint that uses createServer
grep -rl "await createServer()" src/app/api/ --include="*.ts"
```

Step 0.3: check the Supabase configuration.

```bash
# Check that the needed variables exist
cat src/lib/config.ts | grep -E "supabaseUrl|supabaseAnonKey"
```

The config the backend scaffold writes exports `supabasePublishableKey`. When the project's config uses that name, use it in place of `supabaseAnonKey` in the code below.

### Phase 1: Modify `server.ts`

Step 1.1: add the `createClient` import at the top of the file, if it is not there:

```typescript
import { createClient } from '@supabase/supabase-js';
```

Step 1.2: add `createServerFromRequest` after the existing `createServer()` function:

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

Make sure the `Database` type is imported from `@/types/supabase` and that `supabaseUrl` and the publishable key are available from the config.

### Phase 2: Update the API routes

Step 2.1: the update pattern. In every protected endpoint, change:

```typescript
// BEFORE
import { createServer } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServer();
  // ...
}

// AFTER
import { createServerFromRequest } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createServerFromRequest(request);
  // ...
}
```

Step 2.2: special cases. The handler has to use `request`, not `_request`, because the header comes from it.

For handlers that ignored the request (`_request`):

```typescript
// BEFORE
export async function GET(_request: Request) {
  const supabase = await createServer();

// AFTER
export async function GET(request: Request) {
  const supabase = await createServerFromRequest(request);
```

For handlers with `context` (dynamic routes):

```typescript
// BEFORE
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createServer();

// AFTER
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerFromRequest(request);
```

Step 2.3: leave the public endpoints alone. Endpoints that need no authentication stay unchanged, so they remain reachable without a token:

- `/api/health`: public health check
- `/api/openapi`: public OpenAPI spec
- `/api/auth/forgot-password`: password reset flow

Step 2.4: update the shared auth helper (when `src/lib/api/auth.ts` exists).

If `api-routes-setup` created `src/lib/api/auth.ts`, endpoints usually authenticate through `getAuthenticatedUser()` or `requireAuth()`, not by calling `createServer()` directly. Updating only the `route.ts` files while the helper still uses `createServer()` (cookies) leaves Bearer broken in every endpoint that uses the helper. Update the helper so it accepts `request` and uses `createServerFromRequest`:

```typescript
// src/lib/api/auth.ts (UPDATED for dual cookie + Bearer support)
import { createServerFromRequest } from '@/lib/supabase/server';
import { unauthorizedError } from './responses';

// ALWAYS pass the request: createServerFromRequest reads Authorization: Bearer
// and falls back to cookies when there is no header.
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

In every endpoint that uses the helper, pass the `request`:

```typescript
// BEFORE:  const { user, error } = await getAuthenticatedUser();
// AFTER:
export async function GET(request: Request) {
  const { user, error } = await getAuthenticatedUser(request);
  // ...
}
```

### Phase 3: Update the documentation (optional)

Only when OpenAPI exists (`src/lib/openapi/registry.ts`). Scalar (`/api/docs`) renders the auth section from the spec, so there is no React panel to edit.

Step 3.1: check that the registry exists.

```bash
ls src/lib/openapi/registry.ts 2>/dev/null
```

Step 3.2: register the Bearer `securitySchemes` entry and document it in `info.description`. In `src/lib/openapi/registry.ts`:

1. Register the Bearer scheme (if a `bearerAuth` does not already exist):

```typescript
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Supabase access_token (JWT). Get one via POST /auth/v1/token?grant_type=password and send it as Authorization: Bearer <token>.',
});
```

2. Apply `security: [{ bearerAuth: [] }]` in the `registry.registerPath()` calls of the protected endpoints.

3. Document the flow in the `info.description` of `generateOpenAPIDocument()`: Supabase login, `access_token`, the `Authorization: Bearer` header, expiry and renewal. Scalar shows it at the top of `/api/docs` with native copyable examples (including "Test Request").

No React component is created or edited. The docs live entirely in the spec (single source of truth) and Scalar provides the UI.

### Phase 3.5: Rate limiting and secret rotation (required, B7)

Bearer auth opens the API routes to clients outside the browser (scripts, Postman, integrations). Without a rate limit and a rotation plan the feature is half finished (`SKILL.md`, anti-pattern **B7**), so both ship in the same scaffold.

Step 3.5.1: rate limiting on the protected routes. Verify the API with Context7 before writing code.

```
1. Ask the user where the limit lives:
   a) In the platform (hosting firewall / rate-limit rules, e.g. Vercel Firewall)
   b) In code (a `rateLimit(request)` helper with a shared store, e.g. Redis)
   Do NOT use an in-memory counter: every serverless instance has its own.

2. Limit key: the token's user_id when there is one, the IP as a fallback.

3. Apply it to the routes that accept Bearer and to the login proxy if there is one.

4. Response when exceeded: 429 Too Many Requests + a Retry-After header,
   in the same error format as the rest of the API.

5. Values (requests per window) go in `.env` / config, never hardcoded (B4).
```

Step 3.5.2: secret rotation guide. Document it in `.context/api-auth.md` (or in `info.description` when OpenAPI exists): how each secret this feature touches is rotated.

- `SUPABASE_SECRET_KEY` (and any API key of your own, such as `X-API-Key`): generate the new one in the Supabase dashboard, update `.env` and the Vercel scopes (`/vercel-cli`, env-var sync), redeploy, then revoke the old one.
- Supabase JWT signing keys: rotate them from the dashboard. Tokens issued with the old key stop validating, so tell the external clients.
- User tokens: keep the `access_token` short-lived, renew it with the `refresh_token`, and use a global `signOut` to invalidate the sessions of a compromised user.
- When to rotate: when a secret is exposed (log, commit, screenshot), when someone with access leaves, and at the frequency the team sets.

### Phase 4: Validation

Step 4.1: TypeScript check.

```bash
bun run types:check
```

Step 4.2: lint check.

```bash
bun run lint:check
```

Step 4.3: manual test (optional).

```bash
# 1. Get a token
curl -X POST "https://[PROJECT_ID].supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: [PUBLISHABLE_KEY]" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# 2. Use the token
curl "http://localhost:3000/api/[endpoint]" \
  -H "Authorization: Bearer [ACCESS_TOKEN]"
```

## Final checklist

Core implementation:

- [ ] `createServerFromRequest()` added to `server.ts`
- [ ] `createClient` import added
- [ ] Types referenced correctly

API routes:

- [ ] Every protected endpoint updated
- [ ] Import changed from `createServer` to `createServerFromRequest`
- [ ] The `request` parameter is used (not `_request`)
- [ ] (If it exists) `src/lib/api/auth.ts` updated to `createServerFromRequest` and receives `request`
- [ ] Endpoints that use the helper pass `request` to `getAuthenticatedUser(request)` / `requireAuth(request)`

Rate limiting and rotation (B7):

- [ ] Rate limiting applied to the Bearer routes (shared store or platform, never in memory)
- [ ] Exceeding the limit returns 429 + `Retry-After`
- [ ] Secret rotation guide documented

Validation:

- [ ] `bun run types:check` passes
- [ ] `bun run lint:check` passes with no new errors
- [ ] Endpoints still work with cookies (browser)
- [ ] Endpoints work with a Bearer token (Postman)

Documentation (if applicable):

- [ ] Bearer `securitySchemes` registered in `registry.ts` and applied to the protected endpoints
- [ ] Bearer token flow documented in `info.description`
- [ ] Bearer token guide visible at `/api/docs` (Scalar)

## Final report

```markdown
# Bearer Token Support Implemented

## Files modified:

### Core:

- src/lib/supabase/server.ts (new function createServerFromRequest)

### API routes updated:

[List every modified file]

### Documentation:

- src/lib/openapi/registry.ts (`bearerAuth` securitySchemes + `info.description`, if OpenAPI exists)

## How to use:

### 1. Get a token:

POST https://[PROJECT_ID].supabase.co/auth/v1/token?grant_type=password
Headers:

- apikey: [PUBLISHABLE_KEY]
- Content-Type: application/json
  Body:
  {"email": "...", "password": "..."}

### 2. Use the token:

GET /api/[endpoint]
Headers:

- Authorization: Bearer [access_token]

## Compatibility:

- Browser (cookies): keeps working as before
- Postman (Bearer token): new support
- Mobile apps (Bearer token): new support
- Third-party integrations (Bearer token): new support

## Notes:

- The token expires in 1 hour (3600 seconds)
- Several tokens can coexist
- To renew, use the refresh_token with grant_type=refresh_token
- Rate limit: [N] requests per [window], exceeding it returns 429
- Secret rotation: see `.context/api-auth.md`
```

## Questions people ask

Does this break the existing cookie authentication? No. The function looks for a Bearer token and, when there is none, uses cookies automatically.

Does the middleware need changes? No. The middleware keeps protecting pages with cookies, and the API routes handle their own authentication.

Does it work with Row Level Security? Yes. The client built from a Bearer token has the same `user_id` as the cookie one, so RLS applies the same way.

What happens when the token expires? The endpoint returns 401 Unauthorized, and the client must get a new token.

Can the token be used against the Supabase API directly? Yes. The same `access_token` works for the Next.js API routes (Bearer header), the Supabase REST API (Authorization header plus `apikey`) and Supabase Realtime.

How do I get a token without the UI? POST to `/auth/v1/token?grant_type=password` with email and password. See Phase 4.

## Related features

- `api-routes-setup`: this add-on complements it. Run `api-routes-setup` first, then this one to add Bearer support.
- `openapi-setup`: with OpenAPI and `/api/docs` (Scalar) configured, this add-on registers the Bearer `securitySchemes` entry in `registry.ts` and documents the flow in `info.description`.
- `supabase-types-setup`: the `Database` types must be available in `@/types/supabase` for correct typing.

## Rules for the agent

1. Detect the current state before modifying anything. If `createServerFromRequest` already exists, report that it is implemented.
2. Leave public endpoints (health checks, authentication endpoints that must work without a token) unchanged.
3. Preserve existing behaviour. The cookie fallback is what keeps the browser working.
4. Update the docs. When OpenAPI or `/api/docs` exists, updating `securitySchemes` and `info.description` in `registry.ts` is part of the feature.
5. Rate limiting and rotation are required (B7). If the user does not choose where the limit lives, the feature is not done.
6. Change `_request` to `request` in the handlers, because that is how the header reaches the code.

## With nobody at the keyboard

This add-on asks the person in one place, Step 3.5.1 (where the rate limit lives), and shows the user both forms when an existing app clashes with a scaffold choice. The rules for who decides are in `agentic-dev-core/references/decision-protocol.md`.

- A person is present: ask as written.
- A supervised worker: the conductor that launched you answers.
- A routine with nobody: the delegating brief is the approval source. If it names where the limit lives, use that. Otherwise write the code changes in the working tree (Phases 1 to 4), leave the rate limit as the one item not done, and report that B7 is open; the feature is not complete without it. On a clash with the app's own scheme, keep the app's scheme and report the difference. This add-on touches no remote system, so nothing here needs to stop before an outward action.
