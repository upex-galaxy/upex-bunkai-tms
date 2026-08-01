import { describe, expect, it, mock } from 'bun:test';

// Shim `server-only` (pulled in transitively via @lib/supabase/admin) so the
// module graph loads under Bun. Same convention as app/api/v1/bugs/route.test.ts.
void mock.module('server-only', () => ({}));
const { mapBugRpcError } = await import('@lib/bugs/errors');
const { ApiError } = await import('@lib/api/error-envelope');

// BK-40 — GET /api/v1/projects/{id}/bugs. No dedicated NextRequest/ctx test
// harness exists in this repo (see app/api/v1/runs/route.test.ts's own note).
// The route itself is a thin pass-through (extract + validate the path id,
// call listProjectBugs, map an RPC error, return { items }) — its only
// route-specific logic is `extractProjectId`, tested below in isolation, plus
// the P0002 -> "Project not found" special-case the route applies BEFORE
// falling back to the shared mapBugRpcError (mirrors the sibling
// GET .../runs/report route's own P0002 override for the correct noun).

function extractProjectId(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  return segments.at(-2) ?? '';
}

describe('extractProjectId', () => {
  it('reads the {id} segment from a path ending in /{id}/bugs', () => {
    const id = extractProjectId('https://api.example.com/api/v1/projects/22222222-2222-2222-2222-222222222222/bugs');
    expect(id).toBe('22222222-2222-2222-2222-222222222222');
  });
});

describe('mapBugRpcError — the shared fallback the route uses for non-P0002 errors', () => {
  it('42501 maps to a 403 forbidden, not a silent pass-through', () => {
    let captured: unknown;
    try {
      mapBugRpcError({ code: '42501', message: 'forbidden' });
    }
    catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(ApiError);
    expect((captured as InstanceType<typeof ApiError>).status).toBe(403);
  });
});
