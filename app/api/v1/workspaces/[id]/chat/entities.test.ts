import type { Database } from '@lib/types/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'bun:test';
import { parseResolveBody, resolveEntityCards, sanitizeSearchTerm, searchEntities } from './entities';

// BK-218 — resolver + picker search, with a table-backed fake db. The fake
// models RLS only as "rows present in the table are readable by the caller";
// workspace scoping is what the code under test must add on top.

const W = '11111111-1111-4111-8111-111111111111';
const OTHER_W = '99999999-9999-4999-8999-999999999999';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P_OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A_OK = 'a0000000-0000-4000-8000-000000000001';
const A_ARCH = 'a0000000-0000-4000-8000-000000000002';
const A_FOREIGN = 'a0000000-0000-4000-8000-000000000003';
const T_OK = 'c0000000-0000-4000-8000-000000000001';
const T_FOREIGN = 'c0000000-0000-4000-8000-000000000002';
const R_OK = 'd0000000-0000-4000-8000-000000000001';
const R_FOREIGN = 'd0000000-0000-4000-8000-000000000002';
const MISSING = 'e0000000-0000-4000-8000-000000000001';
const ENV = 'f0000000-0000-4000-8000-000000000001';

type Row = Record<string, unknown>;

const TABLES: Record<string, Row[]> = {
  chat_channels: [{ id: 'ch', workspace_id: W, kind: 'general' }],
  projects: [
    { id: P1, name: 'Payments API', slug: 'pay', workspace_id: W },
    { id: P_OTHER, name: 'Secret', slug: 'secret', workspace_id: OTHER_W },
  ],
  atcs: [
    { id: A_OK, project_id: P1, title: 'Checkout total', layer: 'API', archived_at: null, slug: 'm/atc-1', updated_at: '2' },
    { id: A_ARCH, project_id: P1, title: 'Old', layer: 'UI', archived_at: '2026-01-01', slug: 'm/atc-2', updated_at: '1' },
    { id: A_FOREIGN, project_id: P_OTHER, title: 'Hidden title', layer: 'UI', archived_at: null, slug: 'm/atc-3', updated_at: '1' },
  ],
  tests: [
    { id: T_OK, workspace_id: W, title: 'Checkout happy path', automation_status: 'candidate', updated_at: '2' },
    { id: T_FOREIGN, workspace_id: OTHER_W, title: 'Hidden test', automation_status: 'automated', updated_at: '1' },
  ],
  runs: [
    { id: R_OK, workspace_id: W, project_id: P1, environment_id: ENV, status: 'failed', test_title: 'Checkout happy path', started_at: '2' },
    { id: R_FOREIGN, workspace_id: OTHER_W, project_id: P_OTHER, environment_id: ENV, status: 'passed', test_title: 'Hidden run', started_at: '1' },
  ],
  project_environments: [{ id: ENV, name: 'Staging' }],
  run_atcs: [
    { id: 'ra1', atc_id: A_OK, position: 1, status: 'passed', runs: { id: R_OK, started_at: '1', status: 'passed' } },
    { id: 'ra2', atc_id: A_OK, position: 2, status: 'blocked', runs: { id: R_OK, started_at: '1', status: 'failed' } },
  ],
};

function fakeDb(tables: Record<string, Row[]> = TABLES): SupabaseClient<Database> {
  return {
    from: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.in = (c: string, v: unknown[]) => { rows = rows.filter(r => v.includes(r[c])); return q; };
      q.eq = (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return q; };
      q.is = (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return q; };
      q.ilike = (c: string, v: string) => { const n = v.replace(/%/g, '').toLowerCase(); rows = rows.filter(r => String(r[c]).toLowerCase().includes(n)); return q; };
      q.or = (expr: string) => {
        const n = (expr.match(/ilike\.%(.*?)%/)?.[1] ?? '').toLowerCase();
        rows = rows.filter(r => String(r.title).toLowerCase().includes(n) || String(r.slug).toLowerCase().includes(n));
        return q;
      };
      q.order = () => q;
      q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      q.limit = () => q;
      q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
      return q;
    },
  } as unknown as SupabaseClient<Database>;
}

const ref = (type: 'atc' | 'test' | 'run', id: string, projectSlug = 'pay') => ({ type, id, projectSlug });

describe('resolveEntityCards', () => {
  it('returns the current card for each entity type', async () => {
    const { cards } = await resolveEntityCards(fakeDb(), {
      workspaceId: W,
      refs: [ref('atc', A_OK), ref('test', T_OK), ref('run', R_OK)],
    });
    expect(cards[`atc:${A_OK}`]).toMatchObject({ state: 'ok', title: 'Checkout total', status: { value: 'blocked' }, project_name: 'Payments API', href: `/projects/pay/atcs/${A_OK}` });
    expect(cards[`test:${T_OK}`]).toMatchObject({ state: 'ok', status: { value: 'candidate' } });
    expect(cards[`run:${R_OK}`]).toMatchObject({ state: 'ok', status: { value: 'failed' }, detail: 'Staging' });
  });

  it('answers restricted for entities of another workspace with zero metadata', async () => {
    const { cards } = await resolveEntityCards(fakeDb(), {
      workspaceId: W,
      refs: [ref('atc', A_FOREIGN), ref('test', T_FOREIGN), ref('run', R_FOREIGN)],
    });
    for (const c of Object.values(cards)) {
      expect(c.state).toBe('restricted');
      expect(Object.keys(c).sort()).toEqual(['id', 'state', 'type']);
    }
    expect(JSON.stringify(cards)).not.toContain('Hidden');
  });

  it('answers unavailable for missing and archived entities', async () => {
    const { cards } = await resolveEntityCards(fakeDb(), {
      workspaceId: W,
      refs: [ref('atc', A_ARCH), ref('atc', MISSING), ref('run', MISSING), ref('test', MISSING)],
    });
    expect(Object.values(cards).map(c => c.state)).toEqual(['unavailable', 'unavailable', 'unavailable', 'unavailable']);
  });

  it('refuses a Test reference whose Project context is not a project of the workspace', async () => {
    const { cards } = await resolveEntityCards(fakeDb(), { workspaceId: W, refs: [ref('test', T_OK, 'secret'), ref('test', T_OK, 'nope')] });
    expect(cards[`test:${T_OK}`].state).toBe('unavailable');
  });

  it('404s a caller that is not a member of the workspace', async () => {
    const db = fakeDb({ ...TABLES, chat_channels: [] });
    const err = await resolveEntityCards(db, { workspaceId: W, refs: [] }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'not_found' });
  });

  it('ATC with no run position is unrun', async () => {
    const db = fakeDb({ ...TABLES, run_atcs: [] });
    const { cards } = await resolveEntityCards(db, { workspaceId: W, refs: [ref('atc', A_OK)] });
    expect(cards[`atc:${A_OK}`]).toMatchObject({ status: { value: 'unrun' } });
  });
});

describe('parseResolveBody', () => {
  it('validates shape and size', () => {
    expect(() => parseResolveBody({})).toThrow();
    expect(() => parseResolveBody({ refs: [{ type: 'bug', id: A_OK, project_slug: 'x' }] })).toThrow();
    expect(() => parseResolveBody({ refs: [{ type: 'atc', id: 'nope', project_slug: 'x' }] })).toThrow();
    expect(() => parseResolveBody({ refs: Array.from({ length: 21 }, () => ({ type: 'atc', id: A_OK, project_slug: 'x' })) })).toThrow();
    expect(parseResolveBody({ refs: [{ type: 'run', id: R_OK.toUpperCase(), project_slug: 'Pay' }] })).toEqual([{ type: 'run', id: R_OK, projectSlug: 'pay' }]);
  });
});

describe('searchEntities', () => {
  it('lists only entities of the channel workspace, never foreign ones', async () => {
    const { items } = await searchEntities(fakeDb(), { workspaceId: W, q: '' });
    expect(items.map(i => i.type).sort()).toEqual(['atc', 'run', 'test']);
    expect(JSON.stringify(items)).not.toContain('Hidden');
    expect(items.find(i => i.type === 'atc')?.id).toBe(A_OK);
  });

  it('filters by title', async () => {
    const { items } = await searchEntities(fakeDb(), { workspaceId: W, q: 'checkout total' });
    expect(items.map(i => i.id)).toEqual([A_OK]);
  });

  it('sanitizes filter metacharacters', () => {
    expect(sanitizeSearchTerm('a%b,c(d)_e')).toBe('a b c d  e');
  });
});
