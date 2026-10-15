import type { z } from 'zod';
import { ApiError } from '@lib/api/error-envelope';
import { SAVED_VIEW_COPY } from './constants';

// BK-443 — database and validation errors -> the canonical API envelope.
// Contract (AI Tech Lead decision, BK-443):
//   23505 name key        -> 409 conflict          saved_view_name_taken
//   45100 cap trigger     -> 409 conflict          saved_view_limit_reached
//   42501 policy on write -> 404 not_found         project_not_found / saved_view_not_found
//   23514 / 45101         -> 422 validation_failed saved_view_invalid
//   anything else         -> 500 internal_error, fixed client text, and one
//                            structured server-side log line `{ code, message }`.
// Unlike the milestones mapper, the default branch NEVER echoes the raw database
// message: a leaked constraint name or SQL fragment is a free schema probe.

export type SavedViewWriteContext = 'create' | 'change';

export function mapSavedViewDbError(error: { code?: string, message: string }, context: SavedViewWriteContext = 'change'): never {
  switch (error.code) {
    case '23505':
      throw new ApiError('conflict', SAVED_VIEW_COPY.nameTaken, { details: { reason: 'saved_view_name_taken' } });
    case '45100':
      throw new ApiError('conflict', SAVED_VIEW_COPY.limitReached, { details: { reason: 'saved_view_limit_reached' } });
    case '42501':
      // The policy refuses a non-member without saying whether the project
      // exists, so the answer is the same 404 as a project that does not.
      if (context === 'create') {
        throw new ApiError('not_found', 'Project not found.', { details: { reason: 'project_not_found' } });
      }
      throw new ApiError('not_found', 'Saved view not found.', { details: { reason: 'saved_view_not_found' } });
    case '23514':
    case '45101':
      throw new ApiError('validation_failed', 'The saved view was refused.', { details: { reason: 'saved_view_invalid' } });
    default:
      console.error(JSON.stringify({
        level: 'error',
        ts: new Date().toISOString(),
        component: 'api',
        event: 'saved_views_unmapped_db_error',
        code: error.code ?? null,
        message: error.message,
      }));
      throw new ApiError('internal_error', SAVED_VIEW_COPY.unavailable);
  }
}

export function savedViewNotFound(): ApiError {
  return new ApiError('not_found', 'Saved view not found.', { details: { reason: 'saved_view_not_found' } });
}

// Zod issue -> the envelope's `details.reason`. A custom issue carries its own
// reason in `params`; the two structural refusals are recognised by path.
function reasonFor(issue: z.core.$ZodIssue): string {
  const params = (issue as { params?: { reason?: string } }).params;
  if (params?.reason) { return params.reason; }
  if (issue.path[0] === 'view_kind') { return 'view_kind_invalid'; }
  return 'state_invalid';
}

export function parseSavedViewInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) { return result.data; }
  const first = result.error.issues[0];
  throw new ApiError('validation_failed', first.message, {
    details: {
      reason: reasonFor(first),
      issues: result.error.issues.map(i => ({ path: i.path, message: i.message })),
    },
  });
}

// A state refused by `validateStateForKind` -> the same 422 shape.
export function savedViewStateRefusal(reason: 'state_empty' | 'state_invalid' | 'date_range_inverted'): ApiError {
  const message = reason === 'state_empty'
    ? SAVED_VIEW_COPY.nothingToSave
    : reason === 'date_range_inverted'
      ? 'From date is after to date.'
      : 'The saved filters are not valid for this list.';
  return new ApiError('validation_failed', message, { details: { reason } });
}
