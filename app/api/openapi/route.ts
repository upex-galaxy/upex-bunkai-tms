import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withApiHandler } from '@lib/api/handler';

// Serves the generated `public/openapi.json`. The spec is static once built, so
// we read it from disk on each request rather than re-running the generator.
// Regenerate via `bun run openapi:gen` (already wired as a script). Wrapped in
// `withApiHandler` so it gets the same `x-request-id` + access-log treatment
// as every other `/api/v1/*` route.

export const dynamic = 'force-static';

export const GET = withApiHandler(async () => {
  const specPath = resolve(process.cwd(), 'public/openapi.json');
  const body = readFileSync(specPath, 'utf8');
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
});
