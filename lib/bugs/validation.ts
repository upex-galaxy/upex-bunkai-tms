import { BUG_EVIDENCE_MAX, BUG_SEVERITY_VALUES, BUG_STATUS_VALUES, BUG_TITLE_MAX, BUG_TITLE_MIN } from '@lib/bugs/constants';
import { z } from 'zod';

// BK-40 — file-a-bug request validation. Mirrors the `bunkai_create_bug` RPC
// rulebook (0046_bugs.sql) so a malformed body fails fast as a 422 before any
// DB round-trip; the RPC stays the enforcement point of record (it
// re-validates module ∈ project, and backstops title/severity/evidence-count
// independently of whatever this layer already checked).
//
// Two variants, distinguished by which shape the body actually carries —
// `run_step_id` (run-linked) vs. `project_id` + `module_id` (standalone).
// Neither variant carries a literal discriminant tag on the wire (the AC's own
// body shapes have none), so this is a plain `z.union`, not a strict
// `z.discriminatedUnion` (which requires a shared literal key). The route
// narrows the parsed result via `'run_step_id' in body` — safe because the two
// branches have disjoint required-key sets.
//
// Run-linked bodies NEVER carry project_id/module_id/run_id/atc_id — those are
// ALWAYS derived server-side from run_step_id (Technical Decision 7). Even if
// a caller sent them anyway, z.object's default "strip unknown keys" behavior
// silently drops them once the run-linked branch matches, so they can never
// reach the RPC from this path.

export const BUG_TITLE_MESSAGE = `Title must be between ${BUG_TITLE_MIN} and ${BUG_TITLE_MAX} characters`;

const titleSchema = z
  .string()
  .trim()
  .min(BUG_TITLE_MIN, BUG_TITLE_MESSAGE)
  .max(BUG_TITLE_MAX, BUG_TITLE_MESSAGE);

const severitySchema = z.enum(BUG_SEVERITY_VALUES);

// BK-337 (TQ5) — tightened from `z.string().url()` (which accepts ANY
// parseable scheme, including `javascript:`/`data:` — `z.array(z.string().
// url())` applies zod 4.4.3's protocol check only when a protocol regex is
// supplied) to an explicit http/https-only allowlist. `z.regexes.
// httpProtocol` is `/^https?$/`; passing it also activates the `://`
// requirement, so `http:example.com` is rejected too, not only bare
// `javascript:`/`data:` payloads. This is the filing-time half of Scenario
// 3.4 — the render-time allowlist (`isHttpUrl`, `lib/utils/url.ts`) stays the
// load-bearing control for rows already stored before this tightened.
const evidenceUrlsSchema = z
  .array(z.url({ protocol: z.regexes.httpProtocol }))
  .max(BUG_EVIDENCE_MAX)
  .optional();

const BugCreateSharedFieldsSchema = {
  title: titleSchema,
  severity: severitySchema,
  description: z.string().trim().optional(),
  steps_to_reproduce: z.string().optional(),
  evidence_urls: evidenceUrlsSchema,
};

export const BugRunLinkedCreateBodySchema = z.object({
  run_step_id: z.string().uuid(),
  ...BugCreateSharedFieldsSchema,
});

export const BugStandaloneCreateBodySchema = z.object({
  project_id: z.string().uuid(),
  module_id: z.string().uuid(),
  ...BugCreateSharedFieldsSchema,
});

export const BugCreateBodySchema = z.union([
  BugRunLinkedCreateBodySchema,
  BugStandaloneCreateBodySchema,
]);

export type BugRunLinkedCreateBody = z.infer<typeof BugRunLinkedCreateBodySchema>;
export type BugStandaloneCreateBody = z.infer<typeof BugStandaloneCreateBodySchema>;
export type BugCreateBody = z.infer<typeof BugCreateBodySchema>;

export function isRunLinkedBugBody(body: BugCreateBody): body is BugRunLinkedCreateBody {
  return 'run_step_id' in body;
}

// BK-264 (Slice 2) — POST /api/v1/bugs/{id}/assign body. `assignee_user_id:
// null` unassigns (mirrors bunkai_assign_bug's own `p_assignee_user_id
// default null` — the wire body uses the SAME snake_case convention as every
// other bugs-domain body in this file, project_id/module_id included).
export const BugAssignBodySchema = z.object({
  assignee_user_id: z.string().uuid().nullable(),
});

export type BugAssignBody = z.infer<typeof BugAssignBodySchema>;

// BK-264 (Slice 2) — POST /api/v1/bugs/{id}/status body. `status` must be one
// of the bugs domain's own lifecycle values; `bunkai_transition_bug_status`
// is the enforcement point of record for adjacency (one stage forward at a
// time, never backward) — this layer only backstops the VALUE itself.
export const BugStatusTransitionBodySchema = z.object({
  status: z.enum(BUG_STATUS_VALUES),
});

export type BugStatusTransitionBody = z.infer<typeof BugStatusTransitionBodySchema>;
