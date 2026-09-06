import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { callArgumentObject, camelCase, readsField } from '@lib/api/route-forwarding-scan';
import { AtcCreateBodySchema, AtcUpdateBodySchema, AtcWriteBodySchema } from '@lib/atcs/validation';
import { describe, expect, it } from 'bun:test';

// BK-399 — the WIRING guard for the two ATC WRITE routes:
// POST /api/v1/atcs and PATCH /api/v1/atcs/{id}.
//
// THE DEFECT CLASS THIS EXISTS FOR is the one its search sibling
// (`search/route-forwarding.test.ts`) documents, and the argument in that file's
// header applies verbatim here — the write direction is if anything worse. A
// body field can be declared in `AtcWriteBodySchema`, parsed by the route, and
// never forwarded to the RPC. Nothing fails: the schema accepts the value, the
// RPC parameter falls back to its `default null`, and the caller gets 201/200
// with an ATC that silently DROPPED the classification its author picked. No
// error, no warning, and the response body is a legal shape.
//
// The second half of the class is a field forwarded onto the WRONG argument:
// `technique: body.priority, priority: body.technique` compiles (both are
// `string | null`), passes every schema test, and persists each label under the
// other's column. A substring scan mentions both reads and cannot see it. So the
// assertions below are on the PAIR — which RPC argument reads which parsed body
// field — via `lib/api/route-forwarding-scan.ts`.
//
// NOTHING ELSE IN THIS REPO CATCHES IT ON EVERY RUN. `classification-api.test.ts`
// exercises the real handlers end to end and would catch a dropped field, but it
// is ENV-GATED: without Supabase credentials the whole file skips, which is
// exactly the state of a CI job or a contributor machine with no DB access. This
// scan has no dependencies, no database and no mocks, so it always runs.
//
// GENERIC OVER THE SCHEMA, not a hand-written list of names: every key of the
// route's own body schema must be read off `body` by the RPC argument of the
// same name (camelCased; genuine abbreviations are declared in
// `RPC_ARGUMENT_ALIASES` below). Add a field to the schema without wiring it and
// this fails on the next run, naming the field.

const CREATE_ROUTE = resolve(process.cwd(), 'app/api/v1/atcs/route.ts');
const UPDATE_ROUTE = resolve(process.cwd(), 'app/api/v1/atcs/[id]/route.ts');

// The RPC wrappers rename body fields to camelCase, so the expected argument is
// derived. Only genuine abbreviations need to be spelled out — and a key with no
// entry and no camelCase match fails LOUDLY rather than being skipped.
const RPC_ARGUMENT_ALIASES: Record<string, string> = {
  acceptance_criterion_ids: 'acIds',
};

function rpcArgument(schemaKey: string): string {
  return RPC_ARGUMENT_ALIASES[schemaKey] ?? camelCase(schemaKey);
}

// PATCH accepts `user_story_id` / `module_id` (a client GET→edit→PATCH may echo
// them back) but they are IMMUTABLE, so the route must not forward them.
// Derived rather than listed: whatever the update schema adds on top of the
// shared write body is, by construction, the accepted-and-ignored set.
const IMMUTABLE_ON_UPDATE = Object.keys(AtcUpdateBodySchema.shape)
  .filter(key => !(key in AtcWriteBodySchema.shape));

describe('bK-399 — POST /api/v1/atcs forwards every accepted body field to createAtc', () => {
  const { properties } = callArgumentObject(readFileSync(CREATE_ROUTE, 'utf8'), 'await createAtc(');
  const schemaKeys = Object.keys(AtcCreateBodySchema.shape);

  it('the schema declares the keys this scan expects to cover', () => {
    // Pins the surface so a SHRINKING schema is visible too: a removed field
    // would silently stop being covered and the suite would stay green.
    expect([...schemaKeys].sort()).toEqual([
      'acceptance_criterion_ids',
      'assertions',
      'layer',
      'module_id',
      'priority',
      'steps',
      'tags',
      'technique',
      'title',
      'user_story_id',
    ].sort());
  });

  it.each(Object.keys(AtcCreateBodySchema.shape))(
    'passes the parsed `%s` as the RPC argument of the same name, and no other',
    (key) => {
      const argument = rpcArgument(key);
      expect({ key, argument, reads: properties.get(argument) ?? null })
        .toEqual({ key, argument, reads: expect.stringMatching(new RegExp(String.raw`\bbody\.${key}\b`)) });

      const strays = [...properties.entries()]
        .filter(([name, value]) => name !== argument && readsField(value, 'body', key))
        .map(([name]) => name);
      expect({ key, forwardedAlsoAs: strays }).toEqual({ key, forwardedAlsoAs: [] });
    },
  );

  it('reads the actor from the authenticated principal, never from the request body', () => {
    expect(properties.get('actorUserId')).toContain('principal.userId');
    expect([...properties.values()].join('\n')).not.toContain('body.actor');
  });
});

describe('bK-399 — PATCH /api/v1/atcs/{id} forwards every mutable body field to updateAtc', () => {
  const { properties, unnamed } = callArgumentObject(readFileSync(UPDATE_ROUTE, 'utf8'), 'await updateAtc(');
  const mutableKeys = Object.keys(AtcWriteBodySchema.shape);

  it('the shared write body declares the mutable keys this scan expects to cover', () => {
    expect([...mutableKeys].sort()).toEqual([
      'acceptance_criterion_ids',
      'assertions',
      'layer',
      'priority',
      'steps',
      'tags',
      'technique',
      'title',
    ].sort());
  });

  it.each(Object.keys(AtcWriteBodySchema.shape))(
    'passes the parsed `%s` as the RPC argument of the same name, and no other',
    (key) => {
      const argument = rpcArgument(key);
      expect({ key, argument, reads: properties.get(argument) ?? null })
        .toEqual({ key, argument, reads: expect.stringMatching(new RegExp(String.raw`\bbody\.${key}\b`)) });

      const strays = [...properties.entries()]
        .filter(([name, value]) => name !== argument && readsField(value, 'body', key))
        .map(([name]) => name);
      expect({ key, forwardedAlsoAs: strays }).toEqual({ key, forwardedAlsoAs: [] });
    },
  );

  it('never forwards the immutable identifiers, however the client echoes them back', () => {
    expect(IMMUTABLE_ON_UPDATE.sort()).toEqual(['module_id', 'user_story_id']);
    for (const key of IMMUTABLE_ON_UPDATE) {
      const forwardedAs = [...properties.entries()]
        .filter(([, value]) => readsField(value, 'body', key))
        .map(([name]) => name);
      expect({ key, forwardedAs }).toEqual({ key, forwardedAs: [] });
    }
  });

  it('reads the actor and the ATC id from the request, never from the body', () => {
    expect(properties.get('actorUserId')).toContain('principal.userId');
    // `atcId` and `ifMatch` ride in as shorthand properties, so they land in
    // `unnamed` rather than in the name -> expression map.
    expect(unnamed).toContain('atcId');
    expect([...properties.values()].join('\n')).not.toContain('body.actor');
  });
});
