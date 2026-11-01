import { buildWorkspaceRows, countActiveMembersByWorkspace, countActiveOwnersByWorkspace, resolveWorkspacesViewState, selectInIdBatches } from '@lib/account/workspaces';
import { describe, expect, test } from 'bun:test';

// BK-87 PR2 — Workspace-list data-transform + view-state logic (TC-AC2:
// role + current-workspace indicator; TC-AC6: empty state; TC-AC7: retriable
// error, identity isolation).
// BK-90 Slice B adds the owner-count aggregate + `isSoleOwner` cases below
// (Decision 1 — count-based sole-owner gate for the Leave-workspace lock UI).

describe('countActiveMembersByWorkspace', () => {
  test('groups active-membership rows into a per-workspace count', () => {
    const rows = [
      { workspace_id: 'ws-1' },
      { workspace_id: 'ws-1' },
      { workspace_id: 'ws-2' },
    ];
    expect(countActiveMembersByWorkspace(rows)).toEqual({ 'ws-1': 2, 'ws-2': 1 });
  });

  test('empty input -> empty map', () => {
    expect(countActiveMembersByWorkspace([])).toEqual({});
  });
});

describe('countActiveOwnersByWorkspace (BK-90)', () => {
  test('groups active-owner rows into a per-workspace count', () => {
    const rows = [
      { workspace_id: 'ws-1' },
      { workspace_id: 'ws-2' },
      { workspace_id: 'ws-2' },
    ];
    expect(countActiveOwnersByWorkspace(rows)).toEqual({ 'ws-1': 1, 'ws-2': 2 });
  });

  test('empty input -> empty map', () => {
    expect(countActiveOwnersByWorkspace([])).toEqual({});
  });
});

describe('buildWorkspaceRows', () => {
  test('TC-AC2: joins membership + workspace + count, marking the active workspace', () => {
    const rows = buildWorkspaceRows({
      memberships: [
        { workspace_id: 'ws-1', role: 'owner' },
        { workspace_id: 'ws-2', role: 'member' },
      ],
      workspaces: [
        { id: 'ws-1', slug: 'bunkai-core', name: 'Bunkai Core' },
        { id: 'ws-2', slug: 'qa-sandbox', name: 'QA Sandbox' },
      ],
      memberCounts: { 'ws-1': 12, 'ws-2': 5 },
      activeWorkspaceId: 'ws-1',
    });

    expect(rows).toEqual([
      { id: 'ws-1', slug: 'bunkai-core', name: 'Bunkai Core', role: 'owner', memberCount: 12, isActive: true, isSoleOwner: false },
      { id: 'ws-2', slug: 'qa-sandbox', name: 'QA Sandbox', role: 'member', memberCount: 5, isActive: false, isSoleOwner: false },
    ]);
  });

  test('TC-AC2 (boundary): preserves order and produces one row per membership for 10+ workspaces', () => {
    const memberships = Array.from({ length: 12 }, (_, i) => ({ workspace_id: `ws-${i}`, role: 'member' }));
    const workspaces = Array.from({ length: 12 }, (_, i) => ({ id: `ws-${i}`, slug: `ws-${i}`, name: `Workspace ${i}` }));

    const rows = buildWorkspaceRows({ memberships, workspaces, memberCounts: {}, activeWorkspaceId: null });

    expect(rows).toHaveLength(12);
    expect(rows.map(r => r.id)).toEqual(memberships.map(m => m.workspace_id));
    expect(rows.every(r => !r.isActive)).toBe(true);
  });

  test('a membership with no matching workspace row is skipped, not thrown', () => {
    const rows = buildWorkspaceRows({
      memberships: [{ workspace_id: 'ws-missing', role: 'member' }],
      workspaces: [],
      memberCounts: {},
      activeWorkspaceId: null,
    });
    expect(rows).toEqual([]);
  });

  test('a workspace with no active members defaults its count to 0', () => {
    const rows = buildWorkspaceRows({
      memberships: [{ workspace_id: 'ws-1', role: 'viewer' }],
      workspaces: [{ id: 'ws-1', slug: 'ws-1', name: 'Workspace 1' }],
      memberCounts: {},
      activeWorkspaceId: null,
    });
    expect(rows[0].memberCount).toBe(0);
  });

  test('BK-90 Decision 1: sole-owner caller (only active owner row) -> isSoleOwner true', () => {
    const rows = buildWorkspaceRows({
      memberships: [{ workspace_id: 'ws-1', role: 'owner' }],
      workspaces: [{ id: 'ws-1', slug: 'ws-1', name: 'Workspace 1' }],
      memberCounts: { 'ws-1': 5 },
      ownerCounts: { 'ws-1': 1 },
      activeWorkspaceId: null,
    });
    expect(rows[0].isSoleOwner).toBe(true);
  });

  test('BK-90 Decision 1: co-owner (another active owner remains) -> isSoleOwner false', () => {
    const rows = buildWorkspaceRows({
      memberships: [{ workspace_id: 'ws-1', role: 'owner' }],
      workspaces: [{ id: 'ws-1', slug: 'ws-1', name: 'Workspace 1' }],
      memberCounts: { 'ws-1': 5 },
      ownerCounts: { 'ws-1': 2 },
      activeWorkspaceId: null,
    });
    expect(rows[0].isSoleOwner).toBe(false);
  });

  test('BK-90 Decision 1: non-owner role -> isSoleOwner false regardless of the owner-count map', () => {
    const rows = buildWorkspaceRows({
      memberships: [{ workspace_id: 'ws-1', role: 'member' }],
      workspaces: [{ id: 'ws-1', slug: 'ws-1', name: 'Workspace 1' }],
      memberCounts: { 'ws-1': 5 },
      ownerCounts: { 'ws-1': 1 },
      activeWorkspaceId: null,
    });
    expect(rows[0].isSoleOwner).toBe(false);
  });
});

describe('resolveWorkspacesViewState', () => {
  test('TC-AC7: an error takes priority, even with a non-zero row count', () => {
    expect(resolveWorkspacesViewState({ error: true, rowCount: 3 })).toBe('error');
  });

  test('TC-AC6: zero rows with no error -> empty state', () => {
    expect(resolveWorkspacesViewState({ error: false, rowCount: 0 })).toBe('empty');
  });

  test('TC-AC2: one or more rows with no error -> list state', () => {
    expect(resolveWorkspacesViewState({ error: false, rowCount: 1 })).toBe('list');
  });
});

// BK-1122 — a caller in 890 workspaces got the error state: one `.in()` with
// every membership id overflowed the gateway's URL limit (HTTP 400 from 642
// ids up). The reads now go in batches of at most 100 ids.
describe('selectInIdBatches', () => {
  const ids = Array.from({ length: 890 }, (_, i) => `ws-${i}`);

  test('sends 890 ids as 9 batches of at most 100 and concatenates every row', async () => {
    const batches: string[][] = [];
    const rows = await selectInIdBatches(ids, async (batch) => {
      batches.push(batch);
      return { data: batch.map(id => ({ workspace_id: id })), error: null };
    });
    expect(batches).toHaveLength(9);
    expect(Math.max(...batches.map(b => b.length))).toBe(100);
    expect(batches.flat()).toEqual(ids);
    expect(rows.map(r => r.workspace_id)).toEqual(ids);
  });

  test('throws when any batch fails, never returning a partial list', async () => {
    const run = selectInIdBatches(ids, async batch => batch[0] === 'ws-400'
      ? { data: null, error: { message: 'Bad Request' } }
      : { data: batch.map(id => ({ id })), error: null });
    let message = '';
    try {
      await run;
    }
    catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('Bad Request');
  });

  test('no ids -> no request and no rows', async () => {
    let calls = 0;
    const rows = await selectInIdBatches([], async () => {
      calls += 1;
      return { data: [], error: null };
    });
    expect(calls).toBe(0);
    expect(rows).toEqual([]);
  });
});
