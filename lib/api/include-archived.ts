import type { NextRequest } from 'next/server';

// BK-039's opt-in: `?include_archived=true`, and nothing else, asks a listing for
// archived rows. Applies to the Module, User Story and Acceptance Criterion listings
// only (AI Tech Lead ruling on BK-601). Extending it to another family is new scope.
export function wantsArchivedRows(request: NextRequest): boolean {
  return new URL(request.url).searchParams.get('include_archived') === 'true';
}
