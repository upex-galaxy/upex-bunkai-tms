import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-257 — the Home "Recent projects" widget's read contract. Published as a
// first-class endpoint (not just an internal server-component read) so the
// numbers the widget prints are checkable by API instead of only by eye.

const RecentProjectSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().describe('URL slug, unique per workspace — the project route is `/projects/{slug}`.'),
    name: z.string(),
    module_count: z.number().int().describe('Active (non-archived) modules in the project. An exact count, not a scan-derived floor.'),
    atc_count: z.number().int().describe('Active (non-archived) ATCs in the project. An exact count, not a scan-derived floor.'),
    last_activity_at: z
      .string()
      .datetime({ offset: true })
      .describe('The newest of: an ATC written or revised, a module added, a run started/finished/aborted, and — as the floor — the project\'s own creation. Never null: a project that has never been touched still reports when it was created. Three things do NOT advance it: module renames and moves (`modules` carries no `updated_at`), marking a step inside an in-progress run (step marking does not write the `runs` row), and bug activity (deliberately excluded — that surface belongs to the Home open-bugs widget).'),
  })
  .openapi('RecentProject');

const RecentProjectsSchema = z
  .object({
    projects: z
      .array(RecentProjectSchema)
      .describe('Ordered by `last_activity_at` descending, name ascending as the tie-break. At most `limit` entries.'),
  })
  .openapi('RecentProjects');

const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const LimitParam = {
  name: 'limit',
  in: 'query' as const,
  required: false,
  schema: { type: 'integer' as const, minimum: 1, maximum: 20, default: 5 },
  description: 'How many projects to return, 1..20 (default 5 — the Home widget\'s page size). Out of range is rejected with 422, never silently clamped.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/recent-projects',
  tags: ['Workspaces'],
  summary: 'List a workspace\'s projects by most recent activity, with their module and ATC counts',
  description: 'Bearer `atc:read` (or cookie session) — every row carries an exact per-project ATC count, so it is gated like the other ATC reads. Runs entirely under the caller\'s own RLS, so a foreign, nonexistent, or lost-membership workspace id returns the SAME `200 {"projects": []}` an empty workspace does — never an existence echo. A read that FAILS answers 500, never an empty list, so a caller can always tell a quiet workspace from a broken one.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam, LimitParam],
  responses: {
    200: { description: 'The workspace\'s most recently active projects (possibly empty).', content: { 'application/json': { schema: RecentProjectsSchema } } },
    400: { description: 'The workspace id in the path is not a UUID (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: '`limit` is not an integer in 1..20 (`validation_failed`, `details.reason = limit_out_of_range`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    500: { description: 'The rollup could not be read (`internal_error`). Deliberately not collapsed into an empty list.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { RecentProjectSchema, RecentProjectsSchema };
