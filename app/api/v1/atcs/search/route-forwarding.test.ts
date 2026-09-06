import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { callArgumentObject, camelCase, readsField } from '@lib/api/route-forwarding-scan';
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
// The same class has a SECOND half, which a substring scan cannot see: a
// parameter forwarded onto the WRONG argument. `technique: query.priority,
// priority: query.technique` mentions both reads, so "is `query.technique`
// somewhere in the call site?" passes — while a technique query returns
// priority-filtered rows. So the assertions below are on the PAIR: which
// argument reads which parsed field. `lib/api/route-forwarding-scan.ts` parses
// the call's object literal into that mapping.
//
// NO OTHER ASSERTION IN THIS REPO CATCHES IT. The schema unit test passes (the
// schema is correct). The RPC integration test passes (the function filters
// correctly when it is told to). A route response test passes (200 with rows is
// a legal shape). Only comparing the schema's declared keys against what the
// route actually hands to `searchAtcs` can fail.
//
// GENERIC OVER THE SCHEMA, not a hand-written list of three names: every key of
// `AtcSearchQuerySchema.shape` must be read off `query` by the RPC argument of
// the same name (the wrapper renames to camelCase, so the expected argument is
// derived, not listed). Add a parameter to the schema without wiring it and this
// fails on the next run, naming the parameter.
//
// A SOURCE SCAN, deliberately — the scan module's header states why (importing
// the route pulls `server-only` and the Supabase clients; mocking the RPC needs
// Bun's PROCESS-GLOBAL `mock.module`). This file has no dependencies, no
// database and no mocks, so it always runs and can never contaminate anything.

const ROUTE_PATH = resolve(process.cwd(), 'app/api/v1/atcs/search/route.ts');

describe('bK-399 — every accepted search parameter reaches the RPC on its own argument', () => {
  const source = readFileSync(ROUTE_PATH, 'utf8');
  const { properties } = callArgumentObject(source, 'await searchAtcs(');
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
    'passes the parsed `%s` as the RPC argument of the same name, and no other',
    (key) => {
      // The wrapper renames on the way in (`project_id` → `projectId`), so the
      // expected argument name is the camelCase of the schema key.
      const argument = camelCase(key);
      expect({ key, argument, reads: properties.get(argument) ?? null })
        .toEqual({ key, argument, reads: expect.stringMatching(new RegExp(String.raw`\bquery\.${key}\b`)) });

      // ...and the field lands on NOTHING ELSE. This is the half a substring
      // scan misses: a swapped pair still mentions every read.
      const strays = [...properties.entries()]
        .filter(([name, value]) => name !== argument && readsField(value, 'query', key))
        .map(([name]) => name);
      expect({ key, forwardedAlsoAs: strays }).toEqual({ key, forwardedAlsoAs: [] });
    },
  );

  it('reads the actor from the authenticated principal, never from the query string', () => {
    expect(properties.get('actorUserId')).toContain('principal.userId');
    expect([...properties.values()].join('\n')).not.toContain('query.actor');
  });

  it('keeps query and project_id REQUIRED — the narrows do not make this a list endpoint (T3)', () => {
    // `.optional()` on either would turn a search endpoint into an unpaginated
    // list endpoint over a path with no covering index. Scored and rejected.
    //
    // Asserted on the schema's BEHAVIOUR, not on its source text: a string match
    // for `query: z.string().trim().min(1)` is still satisfied by
    // `query: z.string().trim().min(1).optional()`, so the string form of this
    // assertion passed on exactly the change it exists to block.
    const complete = { query: 'login', project_id: '1f7b2b1e-0f5a-4d0e-9a3a-1a2b3c4d5e6f' };
    expect(AtcSearchQuerySchema.safeParse(complete).success).toBe(true);

    const { query: _query, ...withoutQuery } = complete;
    expect(AtcSearchQuerySchema.safeParse(withoutQuery).success).toBe(false);

    const { project_id: _projectId, ...withoutProjectId } = complete;
    expect(AtcSearchQuerySchema.safeParse(withoutProjectId).success).toBe(false);

    // An explicit `undefined` is the shape `.optional()` would start accepting.
    expect(AtcSearchQuerySchema.safeParse({ ...complete, query: undefined }).success).toBe(false);
    expect(AtcSearchQuerySchema.safeParse({ ...complete, project_id: undefined }).success).toBe(false);

    // And an empty query is not a stand-in for "no query" (BK-20 AC5).
    expect(AtcSearchQuerySchema.safeParse({ ...complete, query: '   ' }).success).toBe(false);
  });
});
