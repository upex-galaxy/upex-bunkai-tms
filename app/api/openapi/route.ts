import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Serves the generated `public/openapi.json`. The spec is static once built,
// so we read it from disk at module load and Next prerenders the response.
// Regenerate via `bun run openapi:gen` (already wired as a script).
//
// Note: this route intentionally skips `withApiHandler`. `force-static`
// prerender invokes GET with a stub NextRequest, and the wrapper's access of
// `request.url/headers/method` trips a `#state` private-field error during
// build. The spec is public and cached, so request-id + access logging add no
// value here.

export const dynamic = 'force-static';

const SPEC_BODY = readFileSync(resolve(process.cwd(), 'public/openapi.json'), 'utf8');

export function GET(): Response {
  return new Response(SPEC_BODY, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300, s-maxage=300',
    },
  });
}
