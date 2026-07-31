import { describe, expect, it } from 'bun:test';
import { buildActiveWorkspaceResponse } from './response';

// BK-118 — regression test. The BK-83 fix added the required
// {id, slug, name, role} fields to the switch-workspace response but left the
// legacy `ok: true` / `active_workspace_id` keys in place. This asserts the
// response shape is exactly {id, slug, name, role} — fails against the
// pre-fix literal (which also spread `ok` + `active_workspace_id` into the
// same object) and passes after the cleanup.
describe('buildActiveWorkspaceResponse (BK-118 regression)', () => {
  it('returns exactly {id, slug, name, role} — no legacy ok/active_workspace_id keys', () => {
    const result = buildActiveWorkspaceResponse({
      id: 'ws-1',
      slug: 'acme',
      name: 'Acme Inc',
      role: 'owner',
    });

    expect(result).toEqual({ id: 'ws-1', slug: 'acme', name: 'Acme Inc', role: 'owner' });
    expect(Object.keys(result).sort()).toEqual(['id', 'name', 'role', 'slug']);
    expect(result).not.toHaveProperty('ok');
    expect(result).not.toHaveProperty('active_workspace_id');
  });

  it('preserves a null role (no membership row) without adding legacy fields', () => {
    const result = buildActiveWorkspaceResponse({
      id: 'ws-2',
      slug: 'beta',
      name: 'Beta Co',
      role: null,
    });

    expect(result.role).toBeNull();
    expect(result).not.toHaveProperty('ok');
    expect(result).not.toHaveProperty('active_workspace_id');
  });
});
