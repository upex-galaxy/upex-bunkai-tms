import { describe, expect, it } from 'bun:test';
import { mergeWorkspaceRoles } from './response';

// BK-89 — GET /api/v1/workspaces widening. mergeWorkspaceRoles is the pure
// join that adds the caller's own `role` per workspace onto the RLS-filtered
// `workspaces` rows. Tested in isolation (no DB/Supabase mocking), same style
// as `active-workspace/route.test.ts`.
describe('mergeWorkspaceRoles (BK-89)', () => {
  it('merges role onto the matching workspace by workspace_id', () => {
    const workspaces = [
      { id: 'ws-1', slug: 'acme', name: 'Acme Inc', owner_user_id: 'u-1', plan: 'cloud', created_at: '2026-01-01T00:00:00Z' },
      { id: 'ws-2', slug: 'beta', name: 'Beta Co', owner_user_id: 'u-2', plan: 'community', created_at: '2026-01-02T00:00:00Z' },
    ];
    const memberships = [
      { workspace_id: 'ws-1', role: 'owner' },
      { workspace_id: 'ws-2', role: 'member' },
    ];

    const result = mergeWorkspaceRoles(workspaces, memberships);

    expect(result).toEqual([
      { id: 'ws-1', slug: 'acme', name: 'Acme Inc', owner_user_id: 'u-1', plan: 'cloud', created_at: '2026-01-01T00:00:00Z', role: 'owner' },
      { id: 'ws-2', slug: 'beta', name: 'Beta Co', owner_user_id: 'u-2', plan: 'community', created_at: '2026-01-02T00:00:00Z', role: 'member' },
    ]);
  });

  it('assigns a defensive null role to a workspace with no matching membership row', () => {
    const workspaces = [
      { id: 'ws-1', slug: 'acme', name: 'Acme Inc', owner_user_id: 'u-1', plan: 'cloud', created_at: '2026-01-01T00:00:00Z' },
    ];

    const result = mergeWorkspaceRoles(workspaces, []);

    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBeNull();
  });

  it('preserves workspace field order/values unchanged, only adding role', () => {
    const workspace = { id: 'ws-1', slug: 'acme', name: 'Acme Inc', owner_user_id: 'u-1', plan: 'cloud', created_at: '2026-01-01T00:00:00Z' };
    const memberships = [{ workspace_id: 'ws-1', role: 'admin' }];

    const [result] = mergeWorkspaceRoles([workspace], memberships);

    expect(result).toEqual({ ...workspace, role: 'admin' });
    expect(Object.keys(result).sort()).toEqual(['created_at', 'id', 'name', 'owner_user_id', 'plan', 'role', 'slug']);
  });

  it('returns role: null for every workspace when memberships is an empty array', () => {
    const workspaces = [
      { id: 'ws-1', slug: 'acme', name: 'Acme Inc', owner_user_id: 'u-1', plan: 'cloud', created_at: '2026-01-01T00:00:00Z' },
      { id: 'ws-2', slug: 'beta', name: 'Beta Co', owner_user_id: 'u-2', plan: 'community', created_at: '2026-01-02T00:00:00Z' },
    ];

    const result = mergeWorkspaceRoles(workspaces, []);

    expect(result).toHaveLength(2);
    expect(result.every(ws => ws.role === null)).toBe(true);
  });

  it('joins by workspace_id, not array position — a reordered/misaligned memberships array still matches correctly', () => {
    const workspaces = [
      { id: 'ws-1', slug: 'acme', name: 'Acme Inc', owner_user_id: 'u-1', plan: 'cloud', created_at: '2026-01-01T00:00:00Z' },
      { id: 'ws-2', slug: 'beta', name: 'Beta Co', owner_user_id: 'u-2', plan: 'community', created_at: '2026-01-02T00:00:00Z' },
      { id: 'ws-3', slug: 'gamma', name: 'Gamma LLC', owner_user_id: 'u-3', plan: 'cloud', created_at: '2026-01-03T00:00:00Z' },
    ];
    // Deliberately out of order relative to `workspaces`, and with an extra
    // unrelated row — a positional merge (e.g. `memberships[i]`) would pair
    // ws-1 with 'admin' and ws-3 with 'owner', both wrong.
    const memberships = [
      { workspace_id: 'ws-3', role: 'owner' },
      { workspace_id: 'ws-1', role: 'member' },
      { workspace_id: 'unrelated-ws', role: 'admin' },
    ];

    const result = mergeWorkspaceRoles(workspaces, memberships);

    expect(result.find(ws => ws.id === 'ws-1')?.role).toBe('member');
    expect(result.find(ws => ws.id === 'ws-2')?.role).toBeNull();
    expect(result.find(ws => ws.id === 'ws-3')?.role).toBe('owner');
  });
});
