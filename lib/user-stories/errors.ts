import { ApiError } from '@lib/api/error-envelope';

// Shared User-Story error mapping (BK-14), used by both the scoped create/list
// route and the flat mutate route.

// Map a Postgrest write error: 23505 = the partial unique index (duplicate Jira
// key in this project); 42501 / RLS = caller is not a member.
export function mapStoryWriteError(error: { code?: string, message: string }): never {
  if (error.code === '23505') {
    throw new ApiError('conflict', 'This Jira issue is already linked to a story in this project.', {
      details: { reason: 'external_id_duplicate' },
    });
  }
  if (error.code === '42501' || error.message.toLowerCase().includes('row-level security')) {
    throw new ApiError('forbidden', 'You must be a member of this project.', {
      details: { reason: 'not_a_member' },
    });
  }
  throw new ApiError('internal_error', error.message);
}

export function titleMessage(reason: string): string {
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
