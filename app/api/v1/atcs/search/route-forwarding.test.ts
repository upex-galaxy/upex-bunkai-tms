import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AtcSearchQuerySchema } from '@lib/atcs/search-validation';
import { describe, expect, it } from 'bun:test';

// BK-399 — the WIRING guard for GET /api/v1/atcs/search.
//
// THE DEFECT CLASS THIS EXISTS FOR. A query parameter can be added to
// `AtcSearchQuerySchema` and never forwarded to the RPC. Nothing fails: the
// schema accepts the value, the route parses it, `searchAtcs` is called without
// it, and the caller gets HTTP 200 with an UNFILTERED result set. That is worse
// than a 422 — the client receives a plausible wrong answer with no signal that
// its filter was ignored. It is exactly what was live between the schema slice
// and this one: `technique` and `priority` were accepted and silently dropped.
//
// NO OTHER ASSERTION IN THIS REPO CATCHES IT. The schema unit test passes (the
// schema is correct). The RPC integration test passes (the function filters
// correctly when it is told to). A route response test passes (200 with rows is
// a legal shape). Only comparing the schema's declared keys against what the
// route actually hands to `searchAtcs` can fail.
//
// GENERIC OVER THE SCHEMA, not a hand-written list of three names: every key of
// `AtcSearchQuerySchema.shape` must be read off `query` inside the `searchAtcs`
// call. Add a parameter to the schema without wiring it and this fails on the
// next run, naming the parameter.
//
// A SOURCE SCAN, deliberately, for the reason `lib/api/route-posture-scan.ts`
// states in its own header: importing the route module pulls `server-only`, the
// Supabase clients and the env schema into the test process, and intercepting
// the RPC would need `mock.module`, which in Bun is PROCESS-GLOBAL — a module
// mock installed here leaks into every later test file in the run and breaks
// unrelated suites. This scan has no dependencies, no database, and no mocks,
// so it always runs and can never contaminate anything.

const ROUTE_PATH = resolve(process.cwd(), 'app/api/v1/atcs/search/route.ts');

// Extract the object literal passed as the second argument to `searchAtcs(...)`,
// by brace matching from the first `{` after the call site. Anything less
// precise (a whole-file grep) would pass on a key that appears only in the
// route's header comment — which is exactly how the dropped params read.
function searchAtcsCallArguments(source: string): string {
  const callIndex = source.indexOf('await searchAtcs(');
  if (callIndex === -1) {
    throw new Error('[route-forwarding] no `await searchAtcs(` call found in the search route — the scan is looking at the wrong thing.');
  }
  const open = source.indexOf('{', callIndex);
  if (open === -1) {
    throw new Error('[route-forwarding] searchAtcs is called without an object literal.');
  }
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') { depth += 1; }
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) { return source.slice(open, index + 1); }
    }
  }
  throw new Error('[route-forwarding] unbalanced braces in the searchAtcs call.');
}

describe('bK-399 — every accepted search parameter reaches the RPC', () => {
  const source = readFileSync(ROUTE_PATH, 'utf8');
  const callArguments = searchAtcsCallArguments(source);
  const schemaKeys = Object.keys(AtcSearchQuerySchema.shape);

  it('the schema declares the keys this scan expects to cover', () => {
    // Pins the surface so a shrinking schema is visible too: if a param is
    // removed from the schema, the forwarding assertion below would silently
    // stop covering it and still pass.
    expect(schemaKeys.sort()).toEqual(
      ['layer', 'limit', 'module_id', 'priority', 'project_id', 'query', 'technique'].sort(),
    );
  });

  it.each(Object.keys(AtcSearchQuerySchema.shape))(
    'forwards the parsed `%s` into the searchAtcs arguments',
    (key) => {
      // The wrapper renames on the way in (`project_id` → `projectId`), so the
      // assertion is on the READ side — `query.<key>` — which is stable.
      expect({ key, forwarded: callArguments.includes(`query.${key}`) })
        .toEqual({ key, forwarded: true });
    },
  );

  it('reads the actor from the authenticated principal, never from the query string', () => {
    expect(callArguments).toContain('principal.userId');
    expect(callArguments).not.toContain('query.actor');
  });

  it('keeps query and project_id REQUIRED — the narrows do not make this a list endpoint (T3)', () => {
    // `.optional()` on either would turn a search endpoint into an unpaginated
    // list endpoint over a path with no covering index. Scored and rejected.
    const schemaSource = readFileSync(resolve(process.cwd(), 'lib/atcs/search-validation.ts'), 'utf8');
    expect(schemaSource).toContain('query: z.string().trim().min(1)');
    expect(schemaSource).toContain('project_id: z.string().uuid()');
    expect(schemaSource).not.toContain('query: z.string().trim().min(1).optional()');
    expect(schemaSource).not.toContain('project_id: z.string().uuid().optional()');
  });
});
