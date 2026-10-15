import { ApiError } from '@lib/api/error-envelope';
import { TRACKER_SETTINGS_MESSAGES } from './validation';

// BK-371 — map a bunkai_upsert_project_tracker_settings error (Postgres
// SQLSTATE, migration 0091) to the canonical API envelope. Like every mapper in
// this codebase it always throws (`: never`), so the route's
// `if (error) mapTrackerSettingsRpcError(error)` is exhaustive.
//
//   P0002  project_not_found              -> 404 not_found (also: spoofed actor,
//                                            non-member, soft-deleted workspace;
//                                            deliberately one code, no oracle)
//   42501  forbidden                      -> 403 forbidden / admin_required, ONLY when
//                                            the message is the function's own
//                                            'forbidden'. Any other 42501 (a missing
//                                            table or function privilege, which an
//                                            INVOKER function can now raise) is a 500,
//                                            never a 403 that blames the user. The
//                                            ROUTE proves the Project is visible
//                                            to the caller through RLS before it
//                                            lets this reach the client, so a 403
//                                            never discloses a hidden Project.
//   45410  invalid_destination_key        -> 422 validation_failed
//   45411  destination_required           -> 422 validation_failed
//   45412  invalid_issue_type             -> 422 validation_failed
//   45413  queue_confirmation_required    -> 409 conflict, details.queue_count = N
//   45414  queue_count_mismatch           -> 409 conflict (a defect was filed
//                                            while saving; nothing was applied)

// The RPC message carries the count: 'queue_confirmation_required: N defect(s) would be queued'.
function parseQueueCount(message: string): number | null {
  const match = /:\s*(\d+)\s+defect/.exec(message);
  if (!match) {
    return null;
  }
  const count = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(count) && count > 0 ? count : null;
}

export function mapTrackerSettingsRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case 'P0002':
      throw new ApiError('not_found', 'Project not found.', {
        details: { reason: 'not_found' },
      });
    case '42501':
      if (error.message !== 'forbidden') {
        break;
      }
      throw new ApiError('forbidden', TRACKER_SETTINGS_MESSAGES.admin_required, {
        details: { reason: 'admin_required' },
      });
    case '45410':
      throw new ApiError('validation_failed', TRACKER_SETTINGS_MESSAGES.invalid_destination_key, {
        details: { reason: 'invalid_destination_key' },
      });
    case '45411':
      throw new ApiError('validation_failed', TRACKER_SETTINGS_MESSAGES.destination_required, {
        details: { reason: 'destination_required' },
      });
    case '45412':
      throw new ApiError('validation_failed', TRACKER_SETTINGS_MESSAGES.invalid_issue_type, {
        details: { reason: 'invalid_issue_type' },
      });
    case '45413': {
      const queueCount = parseQueueCount(error.message);
      throw new ApiError('conflict', 'This change queues defects for Jira. Confirm the number to continue.', {
        details: { reason: 'queue_confirmation_required', ...(queueCount === null ? {} : { queue_count: queueCount }) },
      });
    }
    case '45414':
      throw new ApiError('conflict', 'The number of defects to queue changed while saving. Nothing was saved; review the count and try again.', {
        details: { reason: 'queue_count_mismatch' },
      });
    default:
      break;
  }
  // Unmapped (including a 42501 that is not the function's own `forbidden`): log
  // the raw code and message server-side for diagnosis, answer a fixed text. The
  // original message never reaches the client (same convention as mapTestFilterError).
  console.error('bunkai_upsert_project_tracker_settings RPC failed', { code: error.code, message: error.message });
  throw new ApiError('internal_error', 'The tracker settings could not be saved.');
}
