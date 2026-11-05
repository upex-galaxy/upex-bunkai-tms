import { ApiError } from '@lib/api/error-envelope';

// BK-601 — what POST /api/v1/modules/{id}/restore answers for each failure of
// bunkai_restore_module_subtree (migration 0117). A refusal is a 409 with
// `details.reason`, reusing the BK-571 vocabulary. It is not the shared module
// mapper on purpose: that one answers 45002 as a 422 and every 23505 as a path
// collision, and neither is true here.

export const RESTORE_REFUSALS = {
  ANCESTOR_ARCHIVED: 'ancestor_archived',
  DEPTH_EXCEEDED: 'depth_exceeded',
  NAME_COLLISION: 'name_collision',
  STORY_KEY_COLLISION: 'story_key_collision',
} as const;

export type RestoreRefusal = (typeof RESTORE_REFUSALS)[keyof typeof RESTORE_REFUSALS];

interface RpcError {
  code?: string
  message: string
  details?: string | null
}

// The function carries its facts in RAISE ... DETAIL as JSON. A missing or
// unreadable detail still answers the named refusal, just with less to say.
function detailOf(error: RpcError): Record<string, unknown> {
  if (!error.details) { return {}; }
  try {
    const parsed: unknown = JSON.parse(error.details);
    return parsed !== null && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  }
  catch {
    return {};
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function refusal(reason: RestoreRefusal, message: string, extra: Record<string, unknown> = {}): ApiError {
  return new ApiError('conflict', message, { details: { reason, ...extra } });
}

export function restoreErrorFrom(error: RpcError): ApiError {
  const detail = detailOf(error);
  switch (error.code) {
    case '42501':
      return new ApiError('forbidden', 'You must be a member of this project to restore a module.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      return new ApiError('not_found', 'Module not found.');
    case '45004': {
      const name = text(detail.ancestor_name);
      return refusal(
        RESTORE_REFUSALS.ANCESTOR_ARCHIVED,
        `Restore ${name === null ? 'its archived parent module' : `"${name}"`} first. It is still archived.`,
        { ancestor_id: text(detail.ancestor_id), ancestor_name: name },
      );
    }
    case '45002':
      return refusal(RESTORE_REFUSALS.DEPTH_EXCEEDED, 'Restoring this module would pass the maximum nesting depth of 6 levels.');
    case '45005': {
      const name = text(detail.module_name);
      return refusal(
        RESTORE_REFUSALS.NAME_COLLISION,
        `An active module named ${name === null ? 'the same' : `"${name}"`} already exists under the same parent. Rename one of them, then retry.`,
        { module_name: name },
      );
    }
    case '45006':
      return storyKeyRefusal(text(detail.external_id));
    case '23505':
      // A key taken between the function's check and its write trips the index.
      if (error.message.includes('user_stories_project_external_id_uniq')) {
        return storyKeyRefusal(null);
      }
      return new ApiError('internal_error', error.message);
    default:
      return new ApiError('internal_error', error.message);
  }
}

function storyKeyRefusal(key: string | null): ApiError {
  return refusal(
    RESTORE_REFUSALS.STORY_KEY_COLLISION,
    `An active user story already uses ${key === null ? 'the key of a story in this module' : `the key ${key}`}. Change that key, then retry.`,
    { external_id: key },
  );
}
