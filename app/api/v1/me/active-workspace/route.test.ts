import { ApiError } from '@lib/api/error-envelope';
import { describe, expect, it } from 'bun:test';
import { assertSessionOnly, buildActiveWorkspaceResponse } from './response';

// BK-316 — regression test. POST /api/v1/me/active-workspace only ever set
// the `bk_active_ws` cookie; GET /api/v1/me's bearer branch never reads that
// cookie (it resolves `principal.workspaceId ?? workspaces[0]` instead — see
// `me/route.ts`'s `resolveMeActiveWorkspaceId`). So a Bearer/PAT caller got a
// 200 "success" from a switch that was structurally a no-op on that rail.
// The fix rejects the bearer rail outright, mirroring
// `DELETE /api/v1/workspaces/{id}/membership`'s `assertSessionOnly`
// precedent. This exercises the actual guard the route calls (same
// isolation style as that precedent's own test) — not a request/ctx
// harness, since none exists in this repo.
describe('assertSessionOnly (BK-316)', () => {
  it('403s a Personal Access Token (bearer) caller with actionable guidance', () => {
    expect(() => assertSessionOnly({ via: 'bearer' })).toThrow(ApiError);
    try {
      assertSessionOnly({ via: 'bearer' });
      throw new Error('expected to throw');
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe('forbidden');
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).message).toMatch(/workspace_id/i);
    }
  });

  it('allows a cookie (browser session) caller through', () => {
    expect(() => assertSessionOnly({ via: 'cookie' })).not.toThrow();
  });
});

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
