import type { ActivityAction } from '@lib/activity/constants';
import { ACTIVITY_ALLOWED_ACTIONS } from '@lib/activity/constants';

// BK-49 — server-rendered action labels for the activity feed (Types & Type
// Safety § implementation-plan.md). Framework-agnostic — no React/Next
// imports (CLAUDE.md §10's shared-utility rule) — so the API route
// (`app/api/v1/activity/response.ts`) can populate `action_label`, and a
// future `'use client'` view (Slice 3) can import the SAME map for any
// client-side fallback rendering without pulling anything React-shaped along.

export const ACTION_LABELS: Record<ActivityAction, string> = {
  'module.renamed': 'renamed a module',
  'module.description_updated': 'updated a module description',
  'module.moved': 'moved a module',
  'module.archived': 'archived a module',
  'atc.created': 'created an ATC',
  'test.created': 'created a Test',
  'run.finished': 'finished a run',
  'run.aborted': 'aborted a run',
};

// R1 backstop (implementation-plan.md Risk R1 — allowlist/label-map drift):
// every action ACTIVITY_ALLOWED_ACTIONS lists must resolve to a label, and
// vice versa. `labels.test.ts` asserts this holds; this helper is what that
// test (and any future direct-caller backstop) calls.
export function isKnownActivityAction(action: string): action is ActivityAction {
  return (ACTIVITY_ALLOWED_ACTIONS as readonly string[]).includes(action);
}
