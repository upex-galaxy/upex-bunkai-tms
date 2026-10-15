import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';

// BK-443 — path parameters shared by the two saved-views route files.

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export function projectIdFrom(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  const idx = segments.lastIndexOf('projects');
  const id = idx >= 0 ? (segments[idx + 1] ?? '') : '';
  if (!UUID.test(id)) {
    throw new ApiError('bad_request', 'Project id must be a UUID.');
  }
  return id;
}

// `/api/v1/projects/{id}/saved-views/{viewId}` — the id is the last segment.
export function viewIdFrom(request: NextRequest): string {
  const id = new URL(request.url).pathname.split('/').pop() ?? '';
  if (!UUID.test(id)) {
    throw new ApiError('bad_request', 'Saved view id must be a UUID.');
  }
  return id;
}
