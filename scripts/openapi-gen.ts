#!/usr/bin/env bun
/**
 * Generates `public/openapi.json` from the per-route `*.openapi.ts` files.
 *
 * Why sibling `.openapi.ts` files instead of importing `route.ts` directly:
 *   `route.ts` (and the `lib/api/handler.ts` / `lib/supabase/*` it pulls in)
 *   uses `import 'server-only'`, which throws when loaded outside Next.js. The
 *   `.openapi.ts` siblings only depend on `@lib/openapi/registry`, so this
 *   script can import them in pure Bun.
 *
 * Adding a new endpoint:
 *   1. `app/api/v1/<resource>/route.openapi.ts` — call `registry.registerPath`.
 *   2. Add one import line below so the registration runs.
 *   3. Run `bun run openapi:gen` and commit the regenerated `public/openapi.json`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import prettier from 'prettier';
import { buildOpenApiDocument } from '../lib/openapi/registry';
// Side-effect imports — each module calls `registry.registerPath(...)` at
// load time. Order does not matter; the registry deduplicates by method+path.

import '../app/api/v1/auth/check-email/route.openapi';

import '../app/api/v1/auth/confirm/route.openapi';

import '../app/api/v1/auth/magic-link/route.openapi';

import '../app/api/v1/auth/signin/route.openapi';

import '../app/api/v1/auth/signup/route.openapi';

import '../app/api/v1/health/route.openapi';

import '../app/api/v1/route.openapi';

import '../app/api/v1/tokens/route.openapi';

import '../app/api/v1/tokens/[id]/route.openapi';

import '../app/api/v1/invites/accept/route.openapi';

import '../app/api/v1/me/active-workspace/route.openapi';

import '../app/api/v1/me/route.openapi';

import '../app/api/v1/workspaces/route.openapi';

import '../app/api/v1/workspaces/[id]/route.openapi';

import '../app/api/v1/workspaces/[id]/invites/route.openapi';

import '../app/api/v1/workspaces/[id]/invites/[inviteId]/route.openapi';

import '../app/api/v1/workspaces/[id]/membership/route.openapi';

import '../app/api/v1/workspaces/[id]/projects/route.openapi';

import '../app/api/v1/projects/[id]/modules/route.openapi';

import '../app/api/v1/projects/[id]/environments/route.openapi';

import '../app/api/v1/environments/[id]/route.openapi';

import '../app/api/v1/modules/[id]/route.openapi';

import '../app/api/v1/modules/[id]/user-stories/route.openapi';

import '../app/api/v1/user-stories/[id]/route.openapi';

import '../app/api/v1/user-stories/[id]/acceptance-criteria/route.openapi';

import '../app/api/v1/acceptance-criteria/[id]/route.openapi';

import '../app/api/v1/imports/route.openapi';

import '../app/api/v1/imports/[id]/route.openapi';

import '../app/api/v1/atcs/route.openapi';

import '../app/api/v1/atcs/search/route.openapi';

import '../app/api/v1/atcs/[id]/route.openapi';

import '../app/api/v1/atcs/[id]/duplicate/route.openapi';

import '../app/api/v1/atcs/[id]/usage/route.openapi';

import '../app/api/v1/tests/route.openapi';

import '../app/api/v1/tests/[id]/route.openapi';

import '../app/api/v1/tests/[id]/reorder/route.openapi';

import '../app/api/v1/tests/[id]/tags/route.openapi';

import '../app/api/v1/tests/[id]/runs/route.openapi';

import '../app/api/v1/projects/[id]/runs/report/route.openapi';

import '../app/api/v1/runs/route.openapi';

import '../app/api/v1/runs/[id]/route.openapi';

import '../app/api/v1/runs/[id]/abort/route.openapi';

import '../app/api/v1/runs/[id]/finish/route.openapi';

import '../app/api/v1/activity/route.openapi';

import '../app/api/v1/runs/[id]/steps/[stepId]/mark/route.openapi';

const document = buildOpenApiDocument();
const outPath = resolve(process.cwd(), 'public/openapi.json');
mkdirSync(dirname(outPath), { recursive: true });

// Run the JSON through Prettier so the committed file matches the project's
// formatting contract and `format:check` stays green after every regeneration.
const prettierOptions = (await prettier.resolveConfig(outPath)) ?? {};
const formatted = await prettier.format(JSON.stringify(document, null, 2), {
  ...prettierOptions,
  filepath: outPath,
});
writeFileSync(outPath, formatted);

const pathCount = Object.keys(document.paths ?? {}).length;
const operationCount = Object.values(document.paths ?? {}).reduce<number>((acc, pathItem) => {
  if (!pathItem || typeof pathItem !== 'object') {
    return acc;
  }
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;
  return acc + methods.filter(m => m in pathItem).length;
}, 0);

console.log(`✓ Wrote ${outPath} — ${pathCount} paths, ${operationCount} operations.`);
