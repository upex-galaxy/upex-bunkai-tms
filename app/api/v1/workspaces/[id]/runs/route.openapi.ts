import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-513 — the workspace-wide Runs index read contract. The `/runs` screen and
// this endpoint call the same helper, so what QA reads here is what the screen
// renders, and `workspace_run_count` is the number beside the sidebar's
// "Test Runs" entry.

const WorkspaceRunSchema = z
  .object({
    id: z.string().uuid().describe('The Run\'s id. The Run opens at `/projects/{project_slug}/runs/{id}`.'),
    project_id: z.string().uuid(),
    project_slug: z.string().nullable().describe('URL slug of the Run\'s Project, unique per workspace.'),
    project_name: z.string().nullable(),
    test_id: z.string().uuid(),
    test_title: z.string().describe('The Test title as snapshotted when the Run started, not as it reads today.'),
    environment_name: z.string().nullable().describe('The Project environment the Run targeted.'),
    executor_mode: z.enum(['human', 'agent', 'ci']).describe('`human` is a Manual Run; `agent` and `ci` are Automated.'),
    status: z.enum(['running', 'passed', 'failed', 'aborted']).describe('The Run\'s outcome, or `running` while it is in progress.'),
    started_at: z.string().datetime({ offset: true }).describe('The ordering key: newest first, id descending as the tie-break.'),
    finished_at: z.string().datetime({ offset: true }).nullable().describe('`null` while the Run is running.'),
    passed_steps: z.number().int().describe('Exact count of this Run\'s passed steps.'),
    failed_steps: z.number().int(),
    blocked_steps: z.number().int().describe('Pending and skipped steps are deliberately not reported.'),
  })
  .openapi('WorkspaceRun');

const WorkspaceRunsSchema = z
  .object({
    items: z.array(WorkspaceRunSchema).describe('At most `limit` Runs, newest first.'),
    next_cursor: z.string().nullable().describe('Opaque token for the next (older) page with the same filters, or `null` when this page holds the oldest matching Run. Paging until `null` reaches every Run: there is no cap.'),
    workspace_run_count: z.number().int().describe('Every Run of the workspace the caller can see, unfiltered and exact. Not affected by any filter or by `limit`. The sidebar\'s "Test Runs" badge shows the same number.'),
  })
  .openapi('WorkspaceRuns');

const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/runs',
  tags: ['Workspaces'],
  summary: 'List every Run of a workspace, newest first, with its step counts',
  description: 'Bearer `atc:read` (or cookie session), the floor the sibling `/active-runs` read uses. One row per Run across every Project of the workspace, keyset paginated on `(started_at desc, id desc)`. Filters AND-compose and travel with the cursor. Runs entirely under the caller\'s own RLS (the read function is SECURITY INVOKER), so a foreign, nonexistent, or lost-membership workspace id returns the SAME empty `200` an empty workspace does, never an existence echo. A read that FAILS answers 500, never an empty list.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [
    WorkspaceIdParam,
    { name: 'project_id', in: 'query', required: false, schema: { type: 'string', format: 'uuid' }, description: 'Only Runs of this Project.' },
    { name: 'status', in: 'query', required: false, schema: { type: 'array', items: { type: 'string', enum: ['passed', 'failed'] } }, style: 'form', explode: true, description: 'Repeatable. `running` and `aborted` are not filter options; such Runs still appear unfiltered.' },
    { name: 'environment', in: 'query', required: false, schema: { type: 'string', minLength: 1, maxLength: 100 }, description: 'Environment name, matched case-insensitively across Projects.' },
    { name: 'mode', in: 'query', required: false, schema: { type: 'string', enum: ['manual', 'automated'] }, description: '`manual` = executor `human`; `automated` = executor `agent` or `ci`.' },
    { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 50 }, description: 'Page size, 1..50. Out of range is rejected with 422, never clamped. Does not affect `workspace_run_count`.' },
    { name: 'cursor', in: 'query', required: false, schema: { type: 'string' }, description: 'The `next_cursor` of a previous response. A malformed token is 400, never a silent first page.' },
  ],
  responses: {
    200: { description: 'One page of the workspace\'s Runs (possibly empty) and the unfiltered count.', content: { 'application/json': { schema: WorkspaceRunsSchema } } },
    400: { description: 'The workspace id is not a UUID, or the cursor is malformed (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'A filter value or `limit` is invalid (`validation_failed`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    500: { description: 'The Runs could not be read (`internal_error`). Deliberately not collapsed into an empty list.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { WorkspaceRunSchema, WorkspaceRunsSchema };
