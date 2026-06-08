import { ApiError } from '@lib/api/error-envelope';

// BK-18 — map a bunkai_create_atc / bunkai_update_atc / bunkai_get_atc RPC error
// (Postgres SQLSTATE) to the canonical API envelope. The RPCs raise custom
// 45xxx codes for the domain rules; 42501/P0002/23505 are standard SQLSTATEs.
export function mapAtcRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '42501':
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      throw new ApiError('not_found', 'ATC, user story, or module not found.', {
        details: { reason: 'not_found' },
      });
    case '45020':
      throw new ApiError('ac_outside_user_story', 'Every acceptance criterion must belong to the given user story.', {
        details: { reason: 'ac_outside_user_story' },
      });
    case '45021':
      throw new ApiError('module_outside_project_subtree', 'The module must be the user story\'s module or a descendant in the same project.', {
        details: { reason: 'module_outside_project_subtree' },
      });
    case '45022': {
      const currentVersion = parseConflictVersion(error.message);
      throw new ApiError('conflict', 'The ATC was modified by another request.', {
        details: {
          reason: 'version_conflict',
          ...(currentVersion !== null ? { current_version: currentVersion } : {}),
        },
      });
    }
    case '23505':
      throw new ApiError('slug_collision', 'An ATC with this slug already exists in the project. Retry to generate a new one.', {
        details: { reason: 'slug_collision' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}

// The version-conflict RPC raises `version_conflict:<current>` so the route can
// surface the live version in the 409 body without a second round-trip.
function parseConflictVersion(message: string): number | null {
  const match = /version_conflict:(\d+)/.exec(message);
  return match ? Number(match[1]) : null;
}
