import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-258 — the Home "Open bugs" stat card's read contract. Published as a
// first-class endpoint (not just an internal server-component read) so the count
// and the severity breakdown the card prints are checkable by API instead of
// only by eye.

const OpenBugsSeveritySchema = z
  .object({
    P1: z.number().int().describe('Critical.'),
    P2: z.number().int().describe('Major.'),
    P3: z.number().int().describe('Minor.'),
    P4: z.number().int().describe('Trivial.'),
  })
  .describe('Open bugs per severity. The four keys are exhaustive — `bugs.severity` is CHECK-constrained to exactly P1..P4 — so these always sum to `open_count`.')
  .openapi('OpenBugsBySeverity');

const OpenBugsSchema = z
  .object({
    open_count: z
      .number()
      .int()
      .describe('How many bugs are OPEN across the WHOLE workspace, where open means UNRESOLVED: `bugs.status` is one of the values in `open_statuses` (`open` or `in_progress`). Both are pre-resolution states — a defect somebody is actively fixing is still outstanding — so triaging a bug from `open` to `in_progress` deliberately does NOT decrease this number; only resolving or closing it does. `resolved` and `closed` are both excluded. DERIVED as the sum of `by_severity` rather than counted separately, so the total and the breakdown can never contradict each other.'),
    by_severity: OpenBugsSeveritySchema,
    open_statuses: z
      .array(z.enum(['open', 'in_progress']))
      .describe('The exact `bugs.status` values counted above, published so the rule is machine-readable rather than inferred. This is the same list the Home stat card renders from and the same one the supporting partial index is built on, so the three cannot drift apart.'),
  })
  .openapi('OpenBugs');

const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/open-bugs',
  tags: ['Workspaces'],
  summary: 'Count the open bugs across a whole workspace, broken down by severity',
  description: 'Bearer `atc:read` (or cookie session) — the response is a workspace-wide defect posture, the same class of workspace inventory the sibling Home reads (`/recent-projects`, `/active-runs`) are gated on. OPEN means UNRESOLVED: `bugs.status in (\'open\', \'in_progress\')`, the two states before a fix exists; `resolved` and `closed` are excluded. The counted statuses are echoed back as `open_statuses` so the definition travels with the numbers. `open_count` is the sum of `by_severity` by construction, never an independent count, so the total always reconciles with the breakdown. Runs entirely under the caller\'s own RLS, so a foreign, nonexistent, or lost-membership workspace id returns the SAME zeroed `200` a workspace with no open bugs does — never an existence echo. A read that FAILS answers 500, never zeroes.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam],
  responses: {
    200: { description: 'The workspace\'s open-bug count and its severity breakdown (possibly all zero).', content: { 'application/json': { schema: OpenBugsSchema } } },
    400: { description: 'The workspace id in the path is not a UUID (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    500: { description: 'The rollup could not be read (`internal_error`). Deliberately not collapsed into zeroes.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { OpenBugsSchema };
