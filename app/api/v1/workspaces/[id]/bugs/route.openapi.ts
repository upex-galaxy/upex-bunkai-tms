import { BugModuleSchema, BugsAggregatesSchema } from '@app/api/v1/bugs/route.openapi';
import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-555 — the workspace-wide Bug Reports index read contract. The `/bugs`
// screen and this endpoint call the same helper, so what QA reads here is what
// the screen renders, and `workspace_bug_count` is the number beside the
// sidebar's "Bug Reports" entry.

const WorkspaceBugSchema = z
  .object({
    id: z.string().uuid().describe('The defect\'s id. The record opens at `/projects/{project_slug}/bugs/{id}`.'),
    workspace_id: z.string().uuid(),
    project_id: z.string().uuid(),
    project_slug: z.string().nullable().describe('URL slug of the defect\'s Project, unique per workspace.'),
    project_name: z.string().nullable(),
    module: BugModuleSchema.describe('The module the defect was filed against, with its full path. Never an archived module.'),
    run_id: z.string().uuid().nullable().describe('The Run the defect was filed from. `null` for a defect filed manually, and for one whose Run was deleted later.'),
    title: z.string(),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']).describe('P1 Critical, P2 Major, P3 Minor, P4 Trivial. The primary ordering key, P1 first.'),
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
    assignee_user_id: z.string().uuid().nullable(),
    assignee: z
      .object({ user_id: z.string().uuid(), email: z.string().nullable() })
      .nullable()
      .describe('The resolved assignee; `email` is null when it cannot be resolved; `null` when unassigned.'),
    created_at: z.string().datetime({ offset: true }).describe('When the defect was filed: the second ordering key, newest first, then id descending.'),
  })
  .openapi('WorkspaceBug');

const WorkspaceBugsSchema = z
  .object({
    data: z.array(WorkspaceBugSchema).describe('At most `limit` defects, most severe first, then most recently filed.'),
    aggregates: BugsAggregatesSchema.describe('Severity and status counts over EVERY defect matching the filters, not the page.'),
    next_cursor: z.string().nullable().describe('Opaque token for the next page with the same filters, or `null` when this page holds the last matching defect. Paging until `null` reaches every defect: there is no cap.'),
    workspace_bug_count: z.number().int().describe('Every defect of the workspace the caller can see, unfiltered and exact, defects on archived modules excluded. Not affected by any filter or by `limit`. The sidebar\'s "Bug Reports" badge shows the same number.'),
  })
  .openapi('WorkspaceBugs');

const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/bugs',
  tags: ['Workspaces'],
  summary: 'List every defect of a workspace, most severe first, with severity and status counts',
  description: 'Bearer `atc:read` (or cookie session), the floor every workspace read uses. One row per defect across every Project of the workspace, keyset paginated on `(severity asc, created_at desc, id desc)`. Defects filed against an archived module are neither listed nor counted. Filters AND-compose and travel with the cursor. Runs entirely under the caller\'s own RLS (the read function is SECURITY INVOKER), so a foreign, nonexistent, or lost-membership workspace id returns the SAME empty `200` an empty workspace does, never an existence echo. A read that FAILS answers 500, never an empty list.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [
    WorkspaceIdParam,
    { name: 'project_id', in: 'query', required: false, schema: { type: 'string', format: 'uuid' }, description: 'Only defects of this Project.' },
    { name: 'status', in: 'query', required: false, schema: { type: 'string' }, description: 'Comma list of `open`, `in_progress`, `resolved`, `closed`; OR within the list.' },
    { name: 'severity', in: 'query', required: false, schema: { type: 'string' }, description: 'Comma list of `P1`..`P4`; OR within the list.' },
    { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 50 }, description: 'Page size, 1..50. Out of range is rejected with 422, never clamped. Does not affect the counts.' },
    { name: 'cursor', in: 'query', required: false, schema: { type: 'string' }, description: 'The `next_cursor` of a previous response. A malformed token is 400, never a silent first page.' },
  ],
  responses: {
    200: { description: 'One page of the workspace\'s defects (possibly empty), the filtered counts and the unfiltered count.', content: { 'application/json': { schema: WorkspaceBugsSchema } } },
    400: { description: 'The workspace id is not a UUID, or the cursor is malformed (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'A filter value or `limit` is invalid (`validation_failed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    500: { description: 'The defects could not be read (`internal_error`). Deliberately not collapsed into an empty list.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { WorkspaceBugSchema, WorkspaceBugsSchema };
