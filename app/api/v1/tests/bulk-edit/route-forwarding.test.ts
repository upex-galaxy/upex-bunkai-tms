import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { callArgumentObject, camelCase, readsField } from '@lib/api/route-forwarding-scan';
import { TestBulkEditBodySchema } from '@lib/tests/bulk-edit';
import { describe, expect, it } from 'bun:test';

// BK-2099 — the wiring guard for POST /api/v1/tests/bulk-edit: a body field the
// schema accepts but the route never forwards to the RPC fails silently (a 200
// whose batch ignored it). `workspace_id` is not forwarded as is: it feeds the
// workspace resolution, whose result is the `workspaceId` argument.

const ROUTE = resolve(process.cwd(), 'app/api/v1/tests/bulk-edit/route.ts');
const source = readFileSync(ROUTE, 'utf8');
const { properties, unnamed } = callArgumentObject(source, 'await bulkEditTestTags(');

const FORWARDED = ['test_ids', 'mode', 'tags', 'dry_run'];

describe('bK-2099 — POST /api/v1/tests/bulk-edit forwards every accepted body field to bulkEditTestTags', () => {
  it('the schema declares exactly the keys this scan covers', () => {
    expect(Object.keys(TestBulkEditBodySchema.shape).sort()).toEqual([...FORWARDED, 'workspace_id'].sort());
  });

  it.each(FORWARDED)('passes the parsed `%s` as the RPC argument of the same name, and no other', (key) => {
    const argument = camelCase(key);
    expect({ key, argument, reads: properties.get(argument) ?? null })
      .toEqual({ key, argument, reads: expect.stringMatching(new RegExp(String.raw`\bbody\.${key}\b`)) });
    const strays = [...properties.entries()]
      .filter(([name, value]) => name !== argument && readsField(value, 'body', key))
      .map(([name]) => name);
    expect({ key, forwardedAlsoAs: strays }).toEqual({ key, forwardedAlsoAs: [] });
  });

  it('resolves the workspace through pickBulkEditWorkspace, never by forwarding body.workspace_id', () => {
    expect(unnamed).toEqual(['workspaceId']);
    expect(source).toContain('pickBulkEditWorkspace(body.workspace_id, principal)');
  });

  it('reads the actor from the authenticated principal, never from the request body', () => {
    expect(properties.get('actorUserId')).toContain('principal.userId');
    expect([...properties.values()].join('\n')).not.toContain('body.actor');
  });
});
