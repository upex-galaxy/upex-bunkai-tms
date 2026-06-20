import { ApiError } from '@lib/api/error-envelope';

// BK-27 / BK-32 — map a bunkai_create_test / bunkai_get_test_expanded RPC error
// (Postgres SQLSTATE) to the canonical API envelope. The RPC raises custom
// 45xxx codes for the domain rules; 42501/P0002 are standard SQLSTATEs.
export function mapTestRpcError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '42501':
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      throw new ApiError('not_found', 'Test not found.', {
        details: { reason: 'not_found' },
      });
    case '45120':
      throw new ApiError('chain_empty', 'A Test must include at least one ATC.', {
        details: { reason: 'chain_empty' },
      });
    case '45121':
      throw new ApiError('validation_failed', 'Title must be 200 characters or fewer.', {
        details: { reason: 'title_invalid' },
      });
    case '45122':
      // Non-disclosure (INV-3): foreign-workspace and nonexistent ATCs share
      // this byte-identical response — no details, no id echo.
      throw new ApiError('not_found', 'One or more selected ATCs are not available in this workspace.');
    default:
      throw new ApiError('internal_error', error.message);
  }
}

// BK-28 — map a bunkai_reorder_test_steps RPC error to the canonical envelope.
// The RPC raises the tests-domain 451xx block; 42501/P0002 are standard
// SQLSTATEs. The route computes the friendly chain_mismatch details (missing /
// extra) BEFORE the RPC call, so the 45123 case here is the under-lock guard.
export function mapTestReorderError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '42501':
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      throw new ApiError('not_found', 'Test not found.', {
        details: { reason: 'not_found' },
      });
    case '45123':
      throw new ApiError('chain_mismatch', 'The submitted chain does not match the Test\'s ATCs.', {
        details: { reason: 'chain_mismatch' },
      });
    case '45124':
      throw new ApiError('chain_invalid', 'The chain must be non-empty and free of duplicate references.', {
        details: { reason: 'chain_invalid' },
      });
    case '45125': {
      const currentVersion = parseConflictVersion(error.message);
      throw new ApiError('conflict', 'The Test was reordered by another request.', {
        details: {
          reason: 'version_conflict',
          ...(currentVersion !== null ? { current_version: currentVersion } : {}),
        },
      });
    }
    default:
      throw new ApiError('internal_error', error.message);
  }
}

// BK-33 — map a bunkai_set_test_tags RPC error to the canonical envelope. The
// RPC raises 45126 (tags_invalid) for the shape rules the Zod layer also guards
// (so this is the under-lock backstop), and reuses 45125 (version_conflict),
// 42501, P0002 unchanged from the reorder/create paths.
export function mapTestTagsError(error: { code?: string, message: string }): never {
  switch (error.code) {
    case '42501':
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      throw new ApiError('not_found', 'Test not found.', {
        details: { reason: 'not_found' },
      });
    case '45126':
      throw new ApiError('validation_failed', 'Tags must be 50 characters or fewer, comma-free, and at most 20 per Test.', {
        details: { reason: 'tags_invalid' },
      });
    case '45125': {
      const currentVersion = parseConflictVersion(error.message);
      throw new ApiError('conflict', 'The Test was changed by another request.', {
        details: {
          reason: 'version_conflict',
          ...(currentVersion !== null ? { current_version: currentVersion } : {}),
        },
      });
    }
    default:
      throw new ApiError('internal_error', error.message);
  }
}

// BK-33 — map a bunkai_filter_tests_by_tag RPC error to the canonical envelope.
// The filter RPC is read-only and carries no domain SQLSTATEs, so any error is
// unexpected. Log the raw RPC/SQL detail server-side for diagnosis but return a
// generic `internal_error` — never embed the raw message in the response (it
// would leak internal SQL detail and conflate real errors with empty results).
export function mapTestFilterError(error: { code?: string, message: string }): never {
  console.error('bunkai_filter_tests_by_tag RPC failed', error);
  throw new ApiError('internal_error', 'Failed to filter Tests by tag.');
}

// The version-conflict RPC raises `version_conflict:<current>` so the route can
// surface the live version in the 409 body without a second round-trip.
function parseConflictVersion(message: string): number | null {
  const match = /version_conflict:(\d+)/.exec(message);
  return match ? Number(match[1]) : null;
}
