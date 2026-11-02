import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';

// BK-231 — the billing routes live under /api/v1/workspaces/{id}/billing/...;
// the workspace id is the segment right after the literal "workspaces" (the
// same extraction BK-229 / BK-230 use), validated as a UUID.
export function workspaceIdFromRequest(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('workspaces');
  const id = idx >= 0 ? (segments[idx + 1] ?? '') : '';
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
    throw new ApiError('bad_request', 'Workspace id must be a UUID.');
  }
  return id;
}
