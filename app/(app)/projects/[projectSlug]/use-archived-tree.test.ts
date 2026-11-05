import type { ModuleTreeNode } from '@lib/types';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';

// BK-601 — the opt-in's read: off by default, on demand, per view, with loading and a
// named error. The endpoint is a fetch double; the real listing is proven in
// app/api/v1/projects/[id]/modules/route.test.ts.
GlobalRegistrator.register();
afterAll(async () => { await GlobalRegistrator.unregister(); });

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { useArchivedTree } = await import('./use-archived-tree');

const PROJECT = 'p1';
const ATC = {
  id: 'a1',
  project_id: PROJECT,
  module_id: 'm1',
  user_story_id: 's0',
  slug: 'x/atc-1',
  title: 'Live ATC',
  layer: 'UI',
  version: 1,
  status: 'unrun',
  tags: [],
  technique: null,
  priority: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  archived_at: null,
} as const;

// A referentially stable prop, as the layout's is between refreshes. A fresh tree on
// every render would refetch forever, which is exactly what this suite would catch.
const LIVE_TREE: ModuleTreeNode[] = [{
  id: 'm1',
  project_id: PROJECT,
  parent_module_id: null,
  path: 'm1',
  name: 'Live',
  position: 0,
  description: null,
  created_at: '2026-01-01T00:00:00Z',
  archived_at: null,
  children: [],
  user_stories: [],
  atcs: [{ ...ATC, tags: [] }],
}];

function listing(archived: boolean) {
  const modules = [
    { id: 'm1', project_id: PROJECT, parent_module_id: null, path: 'm1', name: 'Live', position: 0, description: null, created_at: '2026-01-01T00:00:00Z', archived_at: null, archive: null },
    ...(archived
      ? [{ id: 'm2', project_id: PROJECT, parent_module_id: null, path: 'm2', name: 'Gone', position: 1, description: null, created_at: '2026-01-01T00:00:00Z', archived_at: '2026-11-05T10:00:00Z', archive: { archived_at: '2026-11-05T10:00:00Z', archived_by: null, archived_with: null } }]
      : []),
  ];
  return { modules, user_stories: [], acceptance_criteria: [], archived_atcs: [] };
}

const realFetch = globalThis.fetch;
let fetches: string[] = [];
let responses: Response[] = [];
let snapshot: ReturnType<typeof useArchivedTree> | null = null;
let mounted: { container: HTMLElement, root: { render: (node: unknown) => void, unmount: () => void } } | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function Harness({ enabled }: { enabled: boolean }) {
  snapshot = useArchivedTree(PROJECT, LIVE_TREE, enabled);
  return null;
}

async function render(enabled: boolean) {
  if (!mounted) {
    const container = document.createElement('div');
    mounted = { container, root: createRoot(container) as never };
  }
  await act(async () => {
    mounted!.root.render(createElement(Harness, { enabled }));
  });
}

beforeEach(() => {
  fetches = [];
  responses = [];
  snapshot = null;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetches.push(String(input));
    const next = responses.shift();
    if (!next) { throw new Error('unexpected fetch'); }
    return next;
  }) as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  if (mounted) {
    await act(async () => { mounted!.root.unmount(); });
    mounted = null;
  }
});

describe('useArchivedTree', () => {
  test('reads nothing and shows the live tree until asked', async () => {
    await render(false);
    expect(fetches).toEqual([]);
    expect(snapshot!.read.status).toBe('off');
    expect(snapshot!.tree).toBe(LIVE_TREE);
  });

  test('merges archived rows with the live ATCs, once, when opted in', async () => {
    responses = [json(listing(true))];
    await render(true);

    expect(fetches).toEqual([`/api/v1/projects/${PROJECT}/modules?include_archived=true`]);
    expect(snapshot!.read).toMatchObject({ status: 'ready', anyArchived: true });
    expect(snapshot!.tree.map(n => n.name)).toEqual(['Live', 'Gone']);
    expect(snapshot!.tree[0].atcs.map(a => a.id)).toEqual(['a1']);
    expect(snapshot!.tree[1].archive?.archived_at).toBe('2026-11-05T10:00:00Z');
  });

  test('draws an ATC once when the read is newer than the live tree', async () => {
    responses = [json({ ...listing(true), archived_atcs: [{ ...ATC, tags: [], archived_at: '2026-11-05T10:00:00Z', archive: null }] })];
    await render(true);

    const atcs = snapshot!.tree[0].atcs;
    expect(atcs.map(a => a.id)).toEqual(['a1']);
    expect(atcs[0].archived_at).toBe('2026-11-05T10:00:00Z');
  });

  test('says when nothing is archived', async () => {
    responses = [json(listing(false))];
    await render(true);
    expect(snapshot!.read).toMatchObject({ status: 'ready', anyArchived: false });
  });

  test('goes back to the live tree when switched off', async () => {
    responses = [json(listing(true))];
    await render(true);
    await render(false);
    expect(snapshot!.read.status).toBe('off');
    expect(snapshot!.tree).toBe(LIVE_TREE);
    expect(fetches).toHaveLength(1);
  });

  test('names a failed read and recovers on reload', async () => {
    responses = [json({ error: { code: 'internal_error', message: 'boom' } }, 500), json(listing(true))];
    await render(true);
    expect(snapshot!.read).toEqual({ status: 'error', message: 'boom' });
    expect(snapshot!.tree).toBe(LIVE_TREE);

    await act(async () => { snapshot!.reload(); });

    expect(snapshot!.read.status).toBe('ready');
    expect(fetches).toHaveLength(2);
  });
});
