import { describe, expect, it, mock } from 'bun:test';

// The route imports `@lib/supabase/admin`, which pulls in `server-only`; shim
// it so the module graph loads under Bun, then import the testable function.
// Same convention as `runs/route.test.ts` / `lib/jira/import-runner.test.ts`.
void mock.module('server-only', () => ({}));
const { resolveMeActiveWorkspaceId } = await import('./route');

// BK-316 — regression test. GET /api/v1/me's bearer branch resolves
// `principal.workspaceId ?? workspaces[0]?.id`; the cookie branch resolves
// via `resolveActiveWorkspaceId`. This pins down both branches, with the
// bearer/null case using the EXACT shape production writes: `POST
// /api/v1/auth/signin` mints a PAT via `lib/api/pat.ts`'s `mintPat` with no
// `workspaceId` argument, which inserts `workspace_id: null` (migration
// 0008_access_tokens.sql — the documented, intended shape for a headless
// global token, not a fixture of convenience picked to keep this suite
// green). Before BK-316, `resolveMeActiveWorkspaceId` did not exist as a
// separate function — this test only became possible once it was extracted
// out of the GET handler body.

const WS_OLDEST = '11111111-1111-1111-1111-111111111111';
const WS_NEWER = '22222222-2222-2222-2222-222222222222';
const WS_BOUND = '33333333-3333-3333-3333-333333333333';

describe('resolveMeActiveWorkspaceId (BK-316)', () => {
  it('a Bearer caller with no workspace-bound token (workspace_id: null — the shape POST /api/v1/auth/signin actually writes) falls back to the oldest visible workspace', () => {
    const result = resolveMeActiveWorkspaceId({ workspaceId: null, via: 'bearer' }, null, [WS_OLDEST, WS_NEWER]);

    expect(result).toBe(WS_OLDEST);
    expect(result).not.toBeNull();
  });

  it('a Bearer caller with a workspace-bound token (POST /api/v1/tokens with a workspace_id) resolves to that workspace, ignoring the visible list', () => {
    const result = resolveMeActiveWorkspaceId({ workspaceId: WS_BOUND, via: 'bearer' }, null, [WS_OLDEST, WS_NEWER]);

    expect(result).toBe(WS_BOUND);
  });

  it('a cookie caller whose bk_active_ws cookie matches a visible workspace resolves to that workspace', () => {
    const result = resolveMeActiveWorkspaceId({ workspaceId: null, via: 'cookie' }, WS_NEWER, [WS_OLDEST, WS_NEWER]);

    expect(result).toBe(WS_NEWER);
  });

  it('a cookie caller with no cookie value falls back to the oldest visible workspace (unchanged behavior)', () => {
    const result = resolveMeActiveWorkspaceId({ workspaceId: null, via: 'cookie' }, null, [WS_OLDEST, WS_NEWER]);

    expect(result).toBe(WS_OLDEST);
  });

  it('a stray cookie value is ignored for a bearer caller — bearer never consults the cookie, only principal.workspaceId / the oldest membership', () => {
    const result = resolveMeActiveWorkspaceId({ workspaceId: null, via: 'bearer' }, WS_NEWER, [WS_OLDEST, WS_NEWER]);

    expect(result).toBe(WS_OLDEST);
  });

  it('returns null when the caller has no visible workspaces at all', () => {
    const result = resolveMeActiveWorkspaceId({ workspaceId: null, via: 'bearer' }, null, []);

    expect(result).toBeNull();
  });
});
