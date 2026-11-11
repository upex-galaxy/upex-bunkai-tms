import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { callArgumentObject, camelCase, readsField } from '@lib/api/route-forwarding-scan';
import { AtcBulkEditBodySchema } from '@lib/atcs/bulk-edit-validation';
import { describe, expect, it } from 'bun:test';

// BK-507 — the WIRING guard for POST /api/v1/atcs/bulk-edit, on the same
// reasoning as `../route-forwarding.test.ts`: a body field the schema accepts but
// the route never forwards to the RPC fails silently (a 200 whose batch ignored
// the field), and a field forwarded onto the wrong argument compiles. The scan has
// no database and no mocks, so it runs everywhere.

const ROUTE = resolve(process.cwd(), 'app/api/v1/atcs/bulk-edit/route.ts');
const { properties } = callArgumentObject(readFileSync(ROUTE, 'utf8'), 'await bulkEditAtcs(');

// Every variant shares these keys; `field` and `change` differ per variant.
const schemaKeys = Object.keys(AtcBulkEditBodySchema.options[0].shape);

describe('bK-507 — POST /api/v1/atcs/bulk-edit forwards every accepted body field to bulkEditAtcs', () => {
  it('the schema declares the keys this scan expects to cover', () => {
    expect([...schemaKeys].sort()).toEqual(['change', 'dry_run', 'field', 'items', 'project_id']);
    for (const option of AtcBulkEditBodySchema.options) {
      expect(Object.keys(option.shape).sort()).toEqual(['change', 'dry_run', 'field', 'items', 'project_id']);
    }
  });

  it.each(schemaKeys)('passes the parsed `%s` as the RPC argument of the same name, and no other', (key) => {
    const argument = camelCase(key);
    expect({ key, argument, reads: properties.get(argument) ?? null })
      .toEqual({ key, argument, reads: expect.stringMatching(new RegExp(String.raw`\bbody\.${key}\b`)) });
    const strays = [...properties.entries()]
      .filter(([name, value]) => name !== argument && readsField(value, 'body', key))
      .map(([name]) => name);
    expect({ key, forwardedAlsoAs: strays }).toEqual({ key, forwardedAlsoAs: [] });
  });

  it('reads the actor from the authenticated principal, never from the request body', () => {
    expect(properties.get('actorUserId')).toContain('principal.userId');
    expect([...properties.values()].join('\n')).not.toContain('body.actor');
  });
});
