import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { assertCanCreateProject, listWorkspaceProjects, mapCreateProjectError, parseProjectSlugFilter } from './response';

// BK-992 — POST /api/v1/workspaces/{id}/projects returned 422
// project_limit_reached for a non-existent workspace because the 0077
// BEFORE INSERT trigger fires ahead of the RLS WITH CHECK. The route now gates
// on `bunkai_can_write_workspace` first; these tests pin that gate and the
// insert-error mapping with a fake-chainable `db` (house convention, see
// `notifications/route.test.ts`).

const MEMBER_WS = '11111111-1111-1111-1111-111111111111';
const FOREIGN_WS = '99999999-9999-9999-9999-999999999999';
const MISSING_WS = '00000000-0000-0000-0000-000000000000';
const DELETED_WS = '22222222-2222-2222-2222-222222222222';

interface RpcCall { fn: string, args: unknown }

// `bunkai_can_write_workspace` returns false for a workspace the caller is
// not a writer of, for an id that does not exist, and for a soft-deleted
// workspace (0084 `deleted_at is null` guard); the fake mirrors that.
function fakeDb(writable: Set<string>, calls: RpcCall[] = []): SupabaseClient<Database> {
  return {
    rpc: async (fn: string, args: { ws_id: string }) => {
      calls.push({ fn, args });
      if (fn === 'bunkai_can_write_workspace') {
        return { data: writable.has(args.ws_id), error: null };
      }
      throw new Error(`unexpected rpc: ${fn}`);
    },
  } as unknown as SupabaseClient<Database>;
}

async function captureError(run: () => Promise<unknown> | unknown): Promise<ApiError> {
  try {
    await run();
  }
  catch (err) {
    return err as ApiError;
  }
  throw new Error('expected to throw');
}

function envelope(err: ApiError) {
  return { status: err.status, code: err.code, message: err.message, details: err.details };
}

describe('assertCanCreateProject', () => {
  it('rejects a non-existent workspace with 403 not_a_member', async () => {
    const err = await captureError(async () => assertCanCreateProject(fakeDb(new Set([MEMBER_WS])), MISSING_WS));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('forbidden');
    expect(err.details).toEqual({ reason: 'not_a_member' });
  });

  it('gives a non-existent and a foreign workspace the identical response (non-disclosure)', async () => {
    const db = fakeDb(new Set([MEMBER_WS]));
    const missing = await captureError(async () => assertCanCreateProject(db, MISSING_WS));
    const foreign = await captureError(async () => assertCanCreateProject(db, FOREIGN_WS));
    expect(envelope(missing)).toEqual(envelope(foreign));
  });

  it('gives a soft-deleted workspace the same 403 as a foreign one (BK-991 consistency)', async () => {
    const db = fakeDb(new Set([MEMBER_WS]));
    const deleted = await captureError(async () => assertCanCreateProject(db, DELETED_WS));
    const foreign = await captureError(async () => assertCanCreateProject(db, FOREIGN_WS));
    expect(envelope(deleted)).toEqual(envelope(foreign));
  });

  it('lets a writer through and asks the same predicate as the insert policy', async () => {
    const calls: RpcCall[] = [];
    await assertCanCreateProject(fakeDb(new Set([MEMBER_WS]), calls), MEMBER_WS);
    expect(calls).toEqual([{ fn: 'bunkai_can_write_workspace', args: { ws_id: MEMBER_WS } }]);
  });

  it('maps an RPC failure to 500 internal_error instead of a false 403', async () => {
    const db = {
      rpc: async () => ({ data: null, error: { code: '08006', message: 'connection failure' } }),
    } as unknown as SupabaseClient<Database>;
    const err = await captureError(async () => assertCanCreateProject(db, MEMBER_WS));
    expect(err.status).toBe(500);
    expect(err.code).toBe('internal_error');
  });
});

describe('mapCreateProjectError', () => {
  it('keeps the plan-limit path for members: 45700 -> 422 project_limit_reached', async () => {
    const err = await captureError(() => mapCreateProjectError({ code: '45700', message: 'project_limit_reached' }));
    expect(err.status).toBe(422);
    expect(err.code).toBe('project_limit_reached');
    expect(err.details).toEqual({ reason: 'project_limit_reached' });
  });

  it('maps 42501 to the same 403 not_a_member envelope as the pre-insert gate', async () => {
    const fromInsert = await captureError(() => mapCreateProjectError({ code: '42501', message: 'new row violates row-level security policy' }));
    const fromGate = await captureError(async () => assertCanCreateProject(fakeDb(new Set()), FOREIGN_WS));
    expect(envelope(fromInsert)).toEqual(envelope(fromGate));
  });

  it('maps 23505 to 409 slug_duplicate_in_workspace', async () => {
    const err = await captureError(() => mapCreateProjectError({ code: '23505', message: 'duplicate key' }));
    expect(err.status).toBe(409);
    expect(err.details).toEqual({ reason: 'slug_duplicate_in_workspace' });
  });

  it('maps anything else to 500 internal_error', async () => {
    const err = await captureError(() => mapCreateProjectError({ code: '99999', message: 'boom' }));
    expect(err.status).toBe(500);
  });
});

describe('route wiring', () => {
  it('runs the access gate before the projects insert', () => {
    const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
    const gate = source.indexOf('await assertCanCreateProject(db, workspaceId)');
    const insert = source.indexOf('.from(\'projects\')');
    expect(gate).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(gate);
  });
});

// BK-1900 — the GET read. A fake chainable `db` records every filter, so the
// tests pin that the workspace id and the slug reach the query and that a read
// failure never turns into the empty list the CLI reads as "Project not found".
interface QueryLog { table: string, select: string, eq: Array<[string, string]>, order: string | null }

function fakeListDb(result: { data: unknown, error: { message: string } | null }, log: QueryLog[]): SupabaseClient<Database> {
  return {
    from: (table: string) => {
      const entry: QueryLog = { table, select: '', eq: [], order: null };
      log.push(entry);
      const chain = {
        select: (cols: string) => {
          entry.select = cols;
          return chain;
        },
        eq: (col: string, value: string) => {
          entry.eq.push([col, value]);
          return chain;
        },
        order: async (col: string) => {
          entry.order = col;
          return result;
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient<Database>;
}

const PROJECT = { id: 'p-1', slug: 'checkout-v2', name: 'Checkout v2', created_at: '2026-11-01T00:00:00Z' };

describe('parseProjectSlugFilter (BK-1900)', () => {
  it('treats an absent slug as no filter', () => {
    expect(parseProjectSlugFilter(null)).toBeNull();
  });

  it('trims a given slug', () => {
    expect(parseProjectSlugFilter('  checkout-v2 ')).toBe('checkout-v2');
  });

  it('refuses a blank slug with 422 slug_invalid instead of listing everything', async () => {
    const err = await captureError(() => parseProjectSlugFilter('   '));
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ reason: 'slug_invalid' });
  });

  it('refuses a slug longer than any slug can be', async () => {
    const err = await captureError(() => parseProjectSlugFilter('a'.repeat(101)));
    expect(err.status).toBe(422);
  });
});

describe('listWorkspaceProjects (BK-1900)', () => {
  it('scopes the read to the workspace and orders by name', async () => {
    const log: QueryLog[] = [];
    const projects = await listWorkspaceProjects(fakeListDb({ data: [PROJECT], error: null }, log), { workspaceId: MEMBER_WS, slug: null });
    expect(projects).toEqual([PROJECT]);
    expect(log).toEqual([{ table: 'projects', select: 'id, slug, name, created_at', eq: [['workspace_id', MEMBER_WS]], order: 'name' }]);
  });

  it('narrows to the exact slug when one is given', async () => {
    const log: QueryLog[] = [];
    await listWorkspaceProjects(fakeListDb({ data: [PROJECT], error: null }, log), { workspaceId: MEMBER_WS, slug: 'checkout-v2' });
    expect(log[0]?.eq).toEqual([['workspace_id', MEMBER_WS], ['slug', 'checkout-v2']]);
  });

  it('answers an RLS-filtered (foreign) workspace with the same empty list as an empty one', async () => {
    const foreign = await listWorkspaceProjects(fakeListDb({ data: [], error: null }, []), { workspaceId: FOREIGN_WS, slug: null });
    const missing = await listWorkspaceProjects(fakeListDb({ data: null, error: null }, []), { workspaceId: MISSING_WS, slug: null });
    expect(foreign).toEqual([]);
    expect(missing).toEqual([]);
  });

  it('maps a failed read to 500 instead of an empty list', async () => {
    const err = await captureError(async () => listWorkspaceProjects(fakeListDb({ data: null, error: { message: 'boom' } }, []), { workspaceId: MEMBER_WS, slug: null }));
    expect(err.status).toBe(500);
    expect(err.code).toBe('internal_error');
  });
});

describe('GET wiring (BK-1900)', () => {
  it('reads through the caller\'s RLS-scoped client, never the admin client, and requires atc:read', () => {
    const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
    const get = source.slice(source.indexOf('export const GET'));
    expect(get).toContain('const { db } = getAuth(ctx);');
    expect(get).toContain('listWorkspaceProjects(db,');
    expect(get).toContain('requires: [\'atc:read\']');
    expect(source).not.toContain('createAdminClient');
  });
});
