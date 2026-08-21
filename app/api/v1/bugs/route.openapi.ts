import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-40 — file a TMS-native bug, either linked to a failed run step or
// standalone. The composed Bug payload mirrors bunkai_bug_json: header +
// nested module `{id, name, path}`.

const BugModuleSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    path: z.string(),
  })
  .openapi('BugModule');

// BK-337 — the module shape `bunkai_bug_json` composes (POST /bugs, POST
// /bugs/{id}/assign, POST /bugs/{id}/status, GET /bugs/{id} — every caller
// that goes through the single-bug composer, migration 0070_bug_detail_
// composer.sql). Distinct from `BugModuleSchema` above, which documents the
// LIST endpoints' own inlined module object (`bunkai_list_bugs` /
// `bunkai_list_project_bugs`) — those two RPCs do NOT carry `archived_at`,
// so widening the shared schema would misdocument them.
const BugDetailModuleSchema = BugModuleSchema
  .extend({
    archived_at: z.string().datetime().nullable().describe('Set when this defect\'s module was archived after filing. The single-bug read does NOT exclude archived-module defects the way the list endpoints do (PO ruling — render the record, tag the module, never 404 it).'),
  })
  .openapi('BugDetailModule');

// BK-337 — nested provenance for a run-linked defect, null end-to-end for a
// standalone one (no run_id/run_step_id/atc_id). `run_step_position` is the
// STORED 0-based `run_steps.position` — the UI adds 1 before display
// ("Failed at step N of {atc_title}"); this wire value is deliberately NOT
// pre-incremented, so the one place that does the 0-to-1 conversion is the
// view layer, not the API contract.
const BugOriginSchema = z
  .object({
    run_id: z.string().uuid(),
    run_step_position: z.number().int().nullable(),
    atc_id: z.string().uuid().nullable(),
    atc_title: z.string().nullable(),
    atc_layer: z.enum(['UI', 'API', 'Unit']).nullable(),
  })
  .openapi('BugOrigin');

const BugSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    project_id: z.string().uuid(),
    module_id: z.string().uuid(),
    module: BugModuleSchema,
    run_id: z.string().uuid().nullable().describe('Provenance link to the source Run; null for a standalone bug.'),
    run_step_id: z.string().uuid().nullable().describe('Provenance link to the source run step; null for a standalone bug.'),
    atc_id: z.string().uuid().nullable().describe('Provenance link to the source ATC; null for a standalone bug.'),
    title: z.string(),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']),
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).describe('BK-40 always creates `open`; the other states are the lifecycle this table already supports for later stories. BK-264 adds POST /api/v1/bugs/{id}/status to advance it one stage at a time.'),
    description: z.string().nullable(),
    steps_to_reproduce: z.string(),
    evidence_urls: z.array(z.string().url()).max(10),
    assignee_user_id: z.string().uuid().nullable().describe('BK-264 — the workspace member currently assigned to this bug, or null if unassigned. Always null immediately after creation (BK-40 never accepts an assignee at filing time). Set via POST /api/v1/bugs/{id}/assign.'),
    created_by: z.string().uuid().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .openapi('Bug');

// BK-337 — the composed shape EVERY caller of `bunkai_bug_json` actually gets
// back (POST /bugs, POST /bugs/{id}/assign, POST /bugs/{id}/status — all
// three RETURN `bunkai_bug_json(...)` directly, 0046/0054 — and the new GET
// /bugs/{id}). Widens `BugSchema`'s plain `module` to `BugDetailModuleSchema`
// (adds `archived_at`) and adds the nullable `origin` object. Deliberately
// NOT used by `BugListItemSchema` below — `bunkai_list_bugs` and `bunkai_
// list_project_bugs` inline their OWN module object with no `archived_at`
// and carry no `origin` at all (Tech Lead TQ2 — the composer is not shared
// with the lists, extending it does not propagate to them).
const BugDetailSchema = BugSchema
  .omit({ module: true })
  .extend({
    module: BugDetailModuleSchema,
    origin: BugOriginSchema.nullable().describe('Provenance for a run-linked defect (originating Run + failed step position + ATC), or null for a standalone one — the page reads null as "Filed manually" (PO ruling).'),
  })
  .openapi('BugDetail');

// BK-264 (Slice 2) — GET /api/v1/bugs resolves assignee display info the SAME
// way GET /api/v1/activity resolves actor display info (ADR-0011's
// `bunkai_resolve_activity_actors`, workspace-scoped and generic to any user
// id, not actor-specific despite its activity-era name). Only the LIST
// endpoint carries this nested object — POST /bugs, POST /bugs/{id}/assign,
// and POST /bugs/{id}/status return the plain `Bug` shape above (its
// `assignee_user_id` is always null right after creation, and the two
// mutation routes return the RPC's own composed json verbatim, which does
// not resolve display info).
const BugAssigneeSchema = z
  .object({
    user_id: z.string().uuid(),
    email: z.string().email().nullable(),
  })
  .openapi('BugAssignee');

const BugListItemSchema = BugSchema
  .extend({
    assignee: BugAssigneeSchema.nullable().describe('Resolved display info for `assignee_user_id`, or null when unassigned.'),
  })
  .openapi('BugListItem');

const RunLinkedCreateBodySchema = z
  .object({
    run_step_id: z.string().uuid().describe('The failed run step this bug is filed from. project_id/module_id/run_id/atc_id are ALWAYS derived server-side from this — never accept them from the client on this path.'),
    title: z.string().min(5).max(200),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']),
    description: z.string().optional(),
    steps_to_reproduce: z.string().optional(),
    evidence_urls: z.array(z.string().url()).max(10).optional(),
  })
  .openapi('BugRunLinkedCreateBody');

const StandaloneCreateBodySchema = z
  .object({
    project_id: z.string().uuid(),
    module_id: z.string().uuid(),
    title: z.string().min(5).max(200),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']),
    description: z.string().optional(),
    steps_to_reproduce: z.string().optional(),
    evidence_urls: z.array(z.string().url()).max(10).optional(),
  })
  .openapi('BugStandaloneCreateBody');

registry.registerPath({
  method: 'post',
  path: '/api/v1/bugs',
  tags: ['Bugs'],
  summary: 'File a bug, linked to a failed run step or standalone',
  description: 'Bearer `atc:write` (or cookie session). Run-linked: body carries ONLY `run_step_id` — project/module/run/ATC context is derived server-side from the run (never client-supplied) and the target step must be `failed`. Standalone: body carries `project_id` + `module_id` directly. Either way `bunkai_create_bug` re-validates module ∈ project server-side. Always creates status `open`. Emits a `bug.filed` activity event.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: z.union([RunLinkedCreateBodySchema, StandaloneCreateBodySchema]),
        },
      },
    },
  },
  responses: {
    201: { description: 'Bug filed.', content: { 'application/json': { schema: z.object({ bug: BugDetailSchema }) } } },
    400: { description: 'Malformed body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope or not a member with write access.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project, module, or run step not found (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (title 5–200 chars, severity P1–P4, evidence links ≤10, module outside project, or the run-linked step is not `failed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

// BK-41 — the filtered, paginated, aggregate-bearing defect list. `data`
// items reuse the exact `BugSchema` shape above (`bunkai_list_bugs`'s
// `jsonb_build_object` call, migration 0051_bugs_list.sql, projects the same
// fields as `bunkai_bug_json`). `aggregates` is computed over the FULL
// filtered set (before `limit`/`cursor`), never derived from only the
// returned page (AC-6/ATP-7).

const BugsAggregatesSchema = z
  .object({
    by_severity: z.object({ P1: z.number().int(), P2: z.number().int(), P3: z.number().int(), P4: z.number().int() }),
    by_status: z.object({
      open: z.number().int(),
      in_progress: z.number().int(),
      resolved: z.number().int(),
      closed: z.number().int(),
    }),
  })
  .openapi('BugsAggregates');

const BugsListPageSchema = z
  .object({
    data: z.array(BugListItemSchema).describe('The page, ordered severity ascending (P1..P4) then created_at desc, id desc (Decision 5). Each item carries a resolved `assignee` (BK-264), the same way GET /api/v1/activity resolves actor display info.'),
    aggregates: BugsAggregatesSchema,
    next_cursor: z
      .string()
      .nullable()
      .describe('Opaque token for the next page, or null when this is the last page. base64url — echo it back verbatim as `?cursor=`; never construct or parse one.'),
  })
  .openapi('BugsListPage');

const ProjectIdParam = {
  name: 'project_id',
  in: 'query' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'The project to list defects for. A project the caller cannot see returns a 200 with an empty page (Decision 9) rather than a 403 or 404 — the same non-disclosure collapse GET /api/v1/activity uses for a foreign workspace_id.',
};

const ModuleIdParam = {
  name: 'module_id',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'Scope the list to this module and its full nested subtree (matched by `modules.path` prefix, depth up to 6 — Decision 7). A module outside `project_id` is rejected as `validation_failed` (`module_not_in_project`), but ONLY once `project_id` itself is confirmed visible (Decision 10).',
};

const StatusParam = {
  name: 'status',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const },
  description: 'Comma-separated list of statuses, OR-within-field (Decision 6), e.g. `open,in_progress`. Each value must be one of open | in_progress | resolved | closed — an unrecognized value (e.g. `in-progress` with a hyphen) is rejected as `validation_failed`.',
};

const SeverityParam = {
  name: 'severity',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const },
  description: 'Comma-separated list of severities, OR-within-field (Decision 6), e.g. `P1,P2`. Combined with `status`, filters are AND-across-fields. Each value must be one of P1 | P2 | P3 | P4.',
};

const LimitParam = {
  name: 'limit',
  in: 'query' as const,
  required: false,
  schema: { type: 'integer' as const, minimum: 1, maximum: 50, default: 30 },
  description: 'Page size, 1..50 (default 30). Out of range is rejected (422); the RPC additionally clamps for direct callers.',
};

const CursorParam = {
  name: 'cursor',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const },
  description: 'Opaque page token taken verbatim from the previous response\'s `next_cursor`. A malformed token returns 400 — it never silently falls back to the first page.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/bugs',
  tags: ['Bugs'],
  summary: 'List and filter defects for a project, with aggregates',
  description: 'Bearer `atc:read` (or cookie session). Mirrors `GET /api/v1/activity` and `GET /api/v1/tests/{id}/runs`. `bunkai_list_bugs` is SECURITY INVOKER — it runs under the caller\'s own RLS, so a non-member `project_id` silently returns a 200 empty page rather than leaking existence. Module filter rolls up the full subtree (Decision 7); archived-module defects are hidden unconditionally (Decision 12); default sort is severity ascending then most-recent-first (Decision 5); pagination is the bugs-local 3-field keyset cursor (Decision 11).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [ProjectIdParam, ModuleIdParam, StatusParam, SeverityParam, LimitParam, CursorParam],
  responses: {
    200: { description: 'One page of the filtered defect list, with aggregates over the full filtered set (possibly empty).', content: { 'application/json': { schema: BugsListPageSchema } } },
    400: { description: 'An undecodable `cursor` (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed — missing/invalid `project_id`, an unrecognized `status`/`severity` value, `limit` outside 1..50, or `module_id` outside `project_id` (`module_not_in_project`, disclosed only once `project_id` is confirmed visible).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { BugDetailSchema, BugModuleSchema, BugsAggregatesSchema, BugSchema, BugsListPageSchema };
