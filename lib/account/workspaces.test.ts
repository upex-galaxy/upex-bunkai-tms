import { buildWorkspaceRows, countActiveMembersByWorkspace, resolveWorkspacesViewState } from '@lib/account/workspaces';
import { describe, expect, test } from 'bun:test';

// BK-87 PR2 — Workspace-list data-transform + view-state logic (TC-AC2:
// role + current-workspace indicator; TC-AC6: empty state; TC-AC7: retriable
// error, identity isolation).

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
      { id: 'ws-1', slug: 'bunkai-core', name: 'Bunkai Core', role: 'owner', memberCount: 12, isActive: true },
      { id: 'ws-2', slug: 'qa-sandbox', name: 'QA Sandbox', role: 'member', memberCount: 5, isActive: false },
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
