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

import '../app/api/v1/auth/magic-link/route.openapi';

import '../app/api/v1/health/route.openapi';

import '../app/api/v1/route.openapi';

import '../app/api/v1/tokens/route.openapi';

import '../app/api/v1/tokens/[id]/route.openapi';

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
