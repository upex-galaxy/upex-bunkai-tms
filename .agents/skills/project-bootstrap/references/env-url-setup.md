# Environment URLs setup (add-on)

This add-on creates one central place for the URLs of each environment (development, staging, production) that detects the current environment and returns the right base URL. It is an infrastructure add-on of `project-bootstrap`: it runs on a greenfield project and on an existing app, and it needs no special MCP.

## Read the `stack:` block first

On an existing app the guard's verdict is `existing-app` (`SKILL.md` → Phase 3). Before the first step, read `.agents/project.yaml` → `stack:` (contract: `.agents/README.md` → `stack`) and resolve every literal this reference writes through it:

- The example paths (`src/app/api/`, `src/lib/supabase/`, `src/types/supabase.ts`) are the greenfield default. Resolve them under `{{stack.app_root}}`. The types file is `{{stack.database.types_path}}`, and with `stack.framework: nextjs-pages` the API lives in `pages/api/`.
- App commands are `{{stack.package_manager}} run <script>` with the script name from `stack.scripts`. A null script is skipped and said so, never invented. Dependencies install with that package manager, which is never changed.
- What the app already has wins. An existing docs UI, error contract, auth scheme, Supabase client location or major version of a dependency (Zod, Next) is read and extended, never replaced or upgraded by this add-on. When they conflict, show the user both shapes.
- The Supabase project ref is `environments.<env>.db_project_ref`, and any database touch follows `agentic-dev-core/references/db-change-doctrine.md`.

## Required input

Read these files:

- `package.json`: the project name.
- `.agents/project.yaml`: the `environments:` block (`web_url` and `api_url` per environment: `{{WEB_URL}}`, `{{environments.<env>.web_url}}`).
- `.env.example`: the current environment variables.
- `src/lib/config.ts`: the existing configuration, if there is one.

Ask the user only for what `.agents/project.yaml` holds as `null` (Step 0.2).

Preconditions: a configured Next.js project, and optionally Vercel configured for deployments.

## Output

Files:

- `src/lib/urls.ts`: the central URL helper.
- `.env.example`: updated with documentation.
- `.agents/project.yaml`: `environments.<env>.web_url` and `api_url` filled in (with the user's OK).

Exported functions:

```typescript
APP_URLS; // Constant with all the URLs
getEnvironment(); // Detects the current environment
getBaseUrl(); // Returns the base URL of the environment
buildUrl(path); // Builds the full URL
```

## Steps

### Phase 0: Gather information

**Step 0.1: Detect the existing configuration**

```bash
# Check whether urls.ts already exists
ls -la src/lib/urls.ts 2>/dev/null && echo "Already exists" || echo "Does not exist"

# Read the URLs already declared in .agents/project.yaml
yq '.environments' .agents/project.yaml
```

**Step 0.2: Get the URLs from the user**

If `environments.<env>.web_url` is `null` for any environment, ask (in the user's language):

```
To set up your project's URLs I need:

1. Staging URL: _______________
   (e.g. https://staging-myapp.vercel.app)

2. Production URL: _______________
   (e.g. https://myapp.vercel.app)

3. Does your project deploy on Vercel? (yes/no): ___
```

Keep the answers for the code. With nobody to ask, see "With nobody at the keyboard".

### Phase 1: Create `src/lib/urls.ts`

**Step 1.1: Create the file**

Create `src/lib/urls.ts` with this content:

````typescript
// src/lib/urls.ts

/**
 * Official application URLs per environment.
 * Single source of truth for every redirect and link.
 *
 * Environments:
 * - development: localhost:3000 (local server)
 * - staging: the 'staging' branch on Vercel (a custom preview-type environment)
 * - production: the 'main' branch on Vercel
 */
export const APP_URLS = {
  development: 'http://localhost:3000',
  staging: '[STAGING_URL]', // Replace with the real URL
  production: '[PRODUCTION_URL]', // Replace with the real URL
} as const;

export type AppEnvironment = keyof typeof APP_URLS;

/**
 * Detects the current environment from the Vercel/Node variables.
 *
 * - VERCEL_ENV='production' → production
 * - VERCEL_ENV='preview' → staging (our custom environment)
 * - No VERCEL_ENV → development (local)
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
 * Returns the application's base URL for the current environment.
 *
 * Usage:
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
 * Builds a full URL from a path.
 *
 * Usage:
 * ```ts
 * buildUrl('/dashboard/settings')
 * // → '[PRODUCTION_URL]/dashboard/settings' (in production)
 * ```
 */
export function buildUrl(path: string): string {
  const baseUrl = getBaseUrl();
  // Make sure the path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}
````

**Step 1.2: Replace the placeholders**

Replace `[STAGING_URL]` and `[PRODUCTION_URL]` with the real values the user gave.

### Phase 2: Update the documentation

**Step 2.1: Update `.env.example`**

Add a URL section at the end of `.env.example`:

```env
# =============================================================================
# Environment URLs (Informational - these are NOT environment variables)
# =============================================================================
# The URLs are managed in src/lib/urls.ts
#
# Configured environments:
# - Development: http://localhost:3000
# - Staging: [STAGING_URL]
# - Production: [PRODUCTION_URL]
#
# Usage in code:
# import { getBaseUrl, buildUrl } from '@/lib/urls'
# const url = getBaseUrl()  // Returns the URL for the current environment
# =============================================================================
```

**Step 2.2: Update `.agents/project.yaml`**

The URLs per environment live in `.agents/project.yaml` → `environments:` and nowhere else that is versioned (`.agents/instructions/agent-project-variables.md` §7). With the user's OK:

- Fill in `environments.staging.web_url` and `api_url`, and `environments.local.*`, wherever they are `null`.
- If the project has production and `environments.production` does not exist, add the block with its three keys (`web_url`, `api_url`, `db_project_ref`).
- Do not write an environments table into `AGENTS.md` or any other doc. The yaml is the source, and `src/lib/urls.ts` is the only place in the code that resolves URLs.

Use the helper functions wherever the code needs a URL. A hardcoded URL breaks on the next environment (B4).

### Phase 3: Validate

**Step 3.1: TypeScript check**

```bash
bun run types:check
```

If it reports errors:

- Check that the path alias `@/lib/urls` is configured in `tsconfig.json`.
- Check the file's syntax.

**Step 3.2: Check the exports**

```bash
# Check that the file exports the expected functions
grep "export" src/lib/urls.ts
```

Expected output:

```
export const APP_URLS
export type AppEnvironment
export function getEnvironment
export function getBaseUrl
export function buildUrl
```

**Step 3.3: Manual test (optional)**

```typescript
// You can try it in a component temporarily:
import { getEnvironment, getBaseUrl, buildUrl } from '@/lib/urls';

console.log('Environment:', getEnvironment());
console.log('Base URL:', getBaseUrl());
console.log('Dashboard URL:', buildUrl('/dashboard'));
```

## With nobody at the keyboard

The general rule and the per-gate table are in `SKILL.md` → "With nobody at the keyboard". For this add-on:

- Staging or production URL is `null` and nobody can answer: take the URL from the delegating brief when it gives one. Otherwise stop before Phase 1 and report the question. `urls.ts` never ships with a `[STAGING_URL]` or `[PRODUCTION_URL]` placeholder.
- Writing `.agents/project.yaml`: a supervised worker needs its conductor's OK, and a routine writes only values its brief supplied. With neither, leave the yaml untouched and put the proposed values in the report. When no `environments.<env>` field is `null`, there is nothing to write.

## Final checklist

Files:

- [ ] `src/lib/urls.ts` created with the right URLs
- [ ] `.env.example` updated with documentation
- [ ] `.agents/project.yaml` → `environments:` filled in

Validation:

- [ ] `bun run types:check` passes without errors
- [ ] The staging and production URLs are correct
- [ ] The functions are exported correctly

Documentation:

- [ ] Developers know to use `getBaseUrl()` and `buildUrl()`
- [ ] It is clear that URLs are never hardcoded

## Final report

````markdown
# Environment URLs setup completed

## File created:

- `src/lib/urls.ts`

## URLs configured:

| Environment | URL                   |
| ----------- | --------------------- |
| Development | http://localhost:3000 |
| Staging     | [STAGING_URL]         |
| Production  | [PRODUCTION_URL]      |

## Available functions:

```typescript
import { getBaseUrl, buildUrl, getEnvironment, APP_URLS } from '@/lib/urls';

// Get the base URL of the current environment
const baseUrl = getBaseUrl();

// Build a full URL
const loginUrl = buildUrl('/login');

// Get the environment name
const env = getEnvironment(); // 'development' | 'staging' | 'production'

// Access specific URLs
const stagingUrl = APP_URLS.staging;
```

## Recommended usage:

```typescript
// ✅ Correct: use the helper
import { buildUrl } from '@/lib/urls';
const redirectUrl = buildUrl('/auth/callback');

// ❌ Wrong: hardcoded URL
const redirectUrl = 'https://myapp.vercel.app/auth/callback';
```

## Documentation updated:

- `.env.example`: URL reference
- `.agents/project.yaml`: `environments:` (URLs per environment)

````

## FAQ

**Why not use environment variables for the URLs?** The URLs are known constants. Environment variables add complexity and a risk of misconfiguration for no gain.

**What is `VERCEL_ENV`?** A variable Vercel sets automatically to name the environment:

- `production` for the `main` branch
- `preview` for the other branches (staging included)
- absent in local development

**Can I add more environments?** Yes. Change `APP_URLS` and `getEnvironment()`. For QA, for example:

```typescript
export const APP_URLS = {
  development: '...',
  qa: 'https://qa-miapp.vercel.app',
  staging: '...',
  production: '...',
}
```

**Does it work in Server Components?** Yes. `process.env.VERCEL_ENV` is available on the server and the client, because it is a system variable and not a `.env` entry.

## Integration with other features

### Supabase Auth redirects

```typescript
import { buildUrl } from '@/lib/urls';

// In login/signup
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: buildUrl('/auth/callback'),
  },
});
```

### Email templates

```typescript
import { buildUrl } from '@/lib/urls';

// In email templates
const confirmUrl = buildUrl(`/confirm?token=${token}`);
```

### OpenAPI registry

```typescript
import { APP_URLS } from '@/lib/urls';

// In registry.ts
servers: [
  { url: `${APP_URLS.development}/api`, description: 'Development' },
  { url: `${APP_URLS.staging}/api`, description: 'Staging' },
  { url: `${APP_URLS.production}/api`, description: 'Production' },
];
```
