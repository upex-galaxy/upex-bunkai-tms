import { ApiError } from '@lib/api/error-envelope';
import { BUG_STATUS_VALUES } from '@lib/bugs/constants';

// BK-40 — map a bunkai_create_bug / bunkai_list_project_bugs RPC error
// (Postgres SQLSTATE) to the canonical API envelope. The RPCs raise the bugs-
// domain 453xx block for the domain rules; 42501/P0002 are standard
// SQLSTATEs. Mirrors lib/runs/errors.ts's switch-on-SQLSTATE shape. The mapper
// always throws (`: never`), so `if (error) mapBugRpcError(error)` is
// exhaustive — control never falls through.
//
// BK-264 (Slice 2) — this mapper is now shared by THREE RPC families:
// bunkai_create_bug/bunkai_list_project_bugs (P0002 = "project or module not
// found"), bunkai_assign_bug, and bunkai_transition_bug_status (P0002 =
// "bug not found" — migration 0054's own non-disclosure boundary: a missing
// bug and a bug in a workspace the caller isn't even a member of collapse
// into the SAME not-found). The `notFoundEntity` option lets each call site
// pick the correct wording for ITS OWN P0002 without duplicating the switch;
// it defaults to 'project_or_module' so the existing POST /api/v1/bugs call
// site (`mapBugRpcError(error)`, no options) keeps its exact prior behavior.
export function mapBugRpcError(
  error: { code?: string, message: string },
  opts: { notFoundEntity?: 'project_or_module' | 'bug', currentStatus?: string } = {},
): never {
  switch (error.code) {
    case '42501':
      throw new ApiError('forbidden', 'You must be a member of this workspace with write access.', {
        details: { reason: 'not_a_member' },
      });
    case 'P0002':
      // Non-disclosure: for create/list, a missing/foreign project OR a
      // module outside it both collapse into the SAME not_found. For
      // assign/status-transition, a missing bug OR a bug in a workspace the
      // caller isn't even a member of collapse into the SAME not_found —
      // never leak WHICH case caused it, either way.
      if (opts.notFoundEntity === 'bug') {
        throwBugNotFound();
      }
      throw new ApiError('not_found', 'Project or module not found.', {
        details: { reason: 'not_found' },
      });
    case '45310': {
      // BK-264 — bunkai_transition_bug_status: the target status is more than
      // one lifecycle stage ahead of the current one (e.g. open -> resolved).
      //
      // Review fix — the AC requires the message to NAME the actual required
      // next stage (e.g. "must move to 'in_progress' first"), not just state
      // the general rule. The RPC's raised exception carries no DETAIL/HINT
      // with that info (0054_bug_assignment_status.sql's `raise exception ...
      // using errcode = '45310'` sets no further payload), so the caller
      // re-derives it here from the bug's own current status (unchanged,
      // since the transition aborted before writing — see
      // performBugStatusTransition, which fetches it only on this error
      // path). BUG_STATUS_VALUES' array order IS the same rank table
      // bunkai_transition_bug_status uses (open=1 .. closed=4), so the next
      // valid stage is simply the following array element.
      const currentIndex = opts.currentStatus
        ? BUG_STATUS_VALUES.indexOf(opts.currentStatus as (typeof BUG_STATUS_VALUES)[number])
        : -1;
      const nextStage = currentIndex >= 0 ? BUG_STATUS_VALUES[currentIndex + 1] : undefined;
      throw new ApiError('validation_failed', nextStage
        ? `A bug must move to '${nextStage}' first.`
        : 'A bug can only move forward one status stage at a time.', {
        details: { reason: 'status_transition_skipped' },
      });
    }
    case '45311':
      // BK-264 — bunkai_transition_bug_status: the target status is not
      // strictly ahead of the current one (backward move, or a same-status
      // no-move, or an unrecognized status value).
      throw new ApiError('validation_failed', 'A bug\'s status cannot move backward.', {
        details: { reason: 'status_transition_backward' },
      });
    case '45312':
      // BK-264 — bunkai_assign_bug: the target assignee has no active
      // workspace_members row for THIS bug's workspace.
      throw new ApiError('validation_failed', 'The assignee must be an active member of this workspace.', {
        details: { reason: 'assignee_not_workspace_member' },
      });
    case '45313':
      // BK-264 — bunkai_assign_bug: the target assignee is an active member,
      // but their role is view-only.
      throw new ApiError('validation_failed', 'A view-only workspace member cannot be assigned bugs.', {
        details: { reason: 'assignee_view_only' },
      });
    case '45300':
      throw new ApiError('validation_failed', 'The module must belong to the current project.', {
        details: { reason: 'module_outside_project' },
      });
    case '45305':
      // Non-disclosure, same shape as module_outside_project: never confirm
      // whether p_run_id exists at all, only that it doesn't belong here.
      throw new ApiError('validation_failed', 'The run must belong to the current project.', {
        details: { reason: 'run_outside_project' },
      });
    case '45306':
      throw new ApiError('validation_failed', 'The run step must belong to the current run.', {
        details: { reason: 'run_step_outside_run' },
      });
    case '45307':
      throw new ApiError('validation_failed', 'The ATC must belong to the current project.', {
        details: { reason: 'atc_outside_project' },
      });
    case '45301':
      // RPC backstop — the Zod layer (lib/bugs/validation.ts) is the primary
      // guard and carries the AC-exact wording; a direct/non-HTTP RPC caller
      // lands here instead.
      throw new ApiError('validation_failed', 'Title must be between 5 and 200 characters.', {
        details: { reason: 'title_invalid' },
      });
    case '45302':
      throw new ApiError('validation_failed', 'Severity must be one of P1, P2, P3, or P4.', {
        details: { reason: 'severity_invalid' },
      });
    case '45303':
      throw new ApiError('validation_failed', 'Evidence links cannot exceed 10.', {
        details: { reason: 'evidence_limit_exceeded' },
      });
    default:
      throw new ApiError('internal_error', error.message);
  }
}

// BK-337 — the ONE non-disclosing 404 for "this Bug does not exist, or
// exists but is outside a workspace the caller belongs to." Extracted so the
// mapper's own P0002/'bug' case AND `GET /api/v1/bugs/{id}`'s null-composer
// check (the new read route never gets a P0002 — `bunkai_bug_json` just
// returns NULL, never an exception) share the exact same message and cannot
// drift into distinguishable responses. Mirrors `lib/traceability/errors.ts`'s
// `throwStoryNotFound`.
export function throwBugNotFound(): never {
  throw new ApiError('not_found', 'Bug not found.', {
    details: { reason: 'not_found' },
  });
}
