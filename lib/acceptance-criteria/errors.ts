import { ApiError } from '@lib/api/error-envelope';

// Shared Acceptance-Criterion error mapping (BK-15), used by both the scoped
// create/list route and the flat mutate route.

// Map an error from a SECURITY DEFINER rpc() call (insert / move / archive). The
// functions raise 42501 for a viewer (RLS is bypassed inside DEFINER, so the
// role gate raises explicitly) and P0002 for a missing parent story / criterion.
export function mapCriterionRpcError(
  error: { code?: string, message: string },
  notFoundMessage = 'Acceptance criterion not found.',
): never {
  if (error.code === '42501') {
    throw new ApiError('forbidden', 'You must be a member of this project.', {
      details: { reason: 'not_a_member' },
    });
  }
  if (error.code === 'P0002') {
    throw new ApiError('not_found', notFoundMessage);
  }
  throw new ApiError('internal_error', error.message);
}

// Map a Postgrest error from a direct (RLS-scoped) title/description update —
// 42501 / an RLS denial means the caller is a viewer, not a member.
export function mapCriterionWriteError(error: { code?: string, message: string }): never {
  if (error.code === '42501' || error.message.toLowerCase().includes('row-level security')) {
    throw new ApiError('forbidden', 'You must be a member of this project.', {
      details: { reason: 'not_a_member' },
    });
  }
  throw new ApiError('internal_error', error.message);
}

export function criterionTitleMessage(reason: string): string {
  switch (reason) {
    case 'title_required':
      return 'Title is required.';
    case 'title_too_short':
      return 'Title must be at least 3 characters.';
    case 'title_too_long':
      return 'Title must be at most 200 characters.';
    default:
      return 'Title is invalid.';
  }
}
