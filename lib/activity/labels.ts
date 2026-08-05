import type { ActivityAction } from '@lib/activity/constants';
import { ACTIVITY_ALLOWED_ACTIONS } from '@lib/activity/constants';

// BK-49 — server-rendered action labels for the activity feed (Types & Type
// Safety § implementation-plan.md). Framework-agnostic — no React/Next
// imports (CLAUDE.md §10's shared-utility rule) — so the API route
// (`app/api/v1/activity/response.ts`) can populate `action_label`, and a
// future `'use client'` view (Slice 3) can import the SAME map for any
// client-side fallback rendering without pulling anything React-shaped along.

// BK-264 (Slice 4) — `bug.assigned` / `bug.reassigned` / `bug.status_changed`
// carry a `{assignee}` / `{status}` placeholder: the ONE fragment a static
// string cannot express (WHO the defect went to, WHICH status it moved to).
// `resolveActionLabel` below is what fills it in. `bug.unassigned` needs no
// placeholder — the AC's literal wording never names the previous assignee.
export const ACTION_LABELS: Record<ActivityAction, string> = {
  'module.renamed': 'renamed a module',
  'module.description_updated': 'updated a module description',
  'module.moved': 'moved a module',
  'module.archived': 'archived a module',
  'atc.created': 'created an ATC',
  'test.created': 'created a Test',
  'run.finished': 'finished a run',
  'run.aborted': 'aborted a run',
  'bug.assigned': 'assigned this defect to {assignee}',
  'bug.reassigned': 'assigned this defect to {assignee}',
  'bug.unassigned': 'unassigned this defect',
  'bug.status_changed': 'moved this defect to {status}',
};

// R1 backstop (implementation-plan.md Risk R1 — allowlist/label-map drift):
// every action ACTIVITY_ALLOWED_ACTIONS lists must resolve to a label, and
// vice versa. `labels.test.ts` asserts this holds; this helper is what that
// test (and any future direct-caller backstop) calls.
export function isKnownActivityAction(action: string): action is ActivityAction {
  return (ACTIVITY_ALLOWED_ACTIONS as readonly string[]).includes(action);
}

// Neutral fallback for an assignee this feed could not resolve to an email
// (departed member, or the batch resolver's response was incomplete) —
// mirrors `lib/activity/view.ts`'s `resolveActorLabel` fallback for the SAME
// reason (AC1 1.4's "safe fallback, never a raw uuid or blank string"), kept
// as its own literal here rather than importing view.ts, which is this
// feed's CLIENT-side module — labels.ts stays server/client-neutral.
const UNRESOLVED_ASSIGNEE_LABEL = 'a workspace member';

// Human-readable status text for `bug.status_changed`'s `{status}` slot
// (acceptance-criteria.md: "moved this defect to in progress", not
// "in_progress"). `closed` never reaches this map — resolveActionLabel
// special-cases it before the lookup (see below).
const BUG_STATUS_DISPLAY: Record<string, string> = {
  open: 'open',
  in_progress: 'in progress',
  resolved: 'resolved',
};

export interface ResolveActionLabelParams {
  action: string
  payload: Record<string, unknown>
  // The assignee's email, ALREADY resolved by the caller through the same
  // ADR-0011 `bunkai_resolve_activity_actors` batch `buildActivityItem` uses
  // for the actor column (`app/api/v1/activity/response.ts`) — this function
  // never resolves an id itself, so there is only ever the one resolver.
  assigneeEmail: string | null
}

// BK-264 (Slice 4) — action_label for the activity feed. For every action
// this repo already knew (the original 8), this is exactly
// `ACTION_LABELS[action]`, unchanged. The 4 Bug-triage actions fill their
// `{assignee}` / `{status}` placeholder from `payload` + the caller-resolved
// `assigneeEmail`; `status: 'closed'` is special-cased to the AC's literal
// "closed this defect" (acceptance-criteria.md — the ONE status this feed
// does not phrase as a move, unlike every other transition's "moved this
// defect to <status>"). An action absent from `ACTION_LABELS` (should not
// happen for anything ACTIVITY_ALLOWED_ACTIONS lists — R1 backstop) falls
// back to the raw action string, matching `buildActivityItem`'s previous
// `ACTION_LABELS[action] ?? action` behavior.
export function resolveActionLabel({ action, payload, assigneeEmail }: ResolveActionLabelParams): string {
  const template = ACTION_LABELS[action as ActivityAction] as string | undefined;
  if (template === undefined) {
    return action;
  }

  if (action === 'bug.status_changed') {
    if (payload.status === 'closed') {
      return 'closed this defect';
    }
    const status = typeof payload.status === 'string' ? payload.status : null;
    const displayStatus = status !== null ? (BUG_STATUS_DISPLAY[status] ?? status) : 'an unknown status';
    return template.replace('{status}', displayStatus);
  }

  if (action === 'bug.assigned' || action === 'bug.reassigned') {
    return template.replace('{assignee}', assigneeEmail ?? UNRESOLVED_ASSIGNEE_LABEL);
  }

  return template;
}
