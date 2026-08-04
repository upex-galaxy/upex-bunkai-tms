import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-259 — the Home "Coverage" stat card's read contract. Published as a
// first-class endpoint (not just an internal server-component read) so the
// percentage the card prints is checkable by API instead of only by eye, and so
// the rule that produces it travels with the number.

const WorkspaceCoverageSchema = z
  .object({
    ac_total: z
      .number()
      .int()
      .describe('Every non-archived acceptance criterion, under a non-archived user story, in a non-archived module, across every project in the workspace. The denominator of both percentages below.'),
    ac_bound: z
      .number()
      .int()
      .describe('How many of `ac_total` have at least one non-archived ATC linked to them, executed or not. Always <= `ac_total`.'),
    ac_executed: z
      .number()
      .int()
      .describe('How many of `ac_bound` have been verified: at least one ATC is linked AND no linked ATC is still awaiting its first execution. An acceptance criterion whose ATCs are bound but never run is deliberately NOT counted here. Always <= `ac_bound`.'),
    ac_not_run: z
      .number()
      .int()
      .describe('Bound but not yet verified — `ac_bound - ac_executed`. Kept as its own figure because "test cases exist but nobody has run them" is a different problem from "no test cases exist", and a single coverage percentage hides the difference.'),
    ac_uncovered: z
      .number()
      .int()
      .describe('Nothing bound at all — `ac_total - ac_bound`. `ac_executed`, `ac_not_run` and `ac_uncovered` are an exhaustive three-way partition of `ac_total` and always sum back to it.'),
    ac_coverage_percent: z
      .number()
      .int()
      .nullable()
      .describe('`ac_bound / ac_total` as a whole percent, rounded half-up. This is the figure the Home Coverage card prints, and it is the same quantity the per-project Metrics screen shows as "AC coverage". NULL — never 0 — when `ac_total` is 0, because a workspace with no acceptance criteria has nothing to measure rather than a failing score.'),
    executed_coverage_percent: z
      .number()
      .int()
      .nullable()
      .describe('`ac_executed / ac_total` as a whole percent, rounded half-up — the stricter reading, counting only acceptance criteria whose coverage has actually been run. Matches the per-project Metrics screen\'s "Executed coverage" tile. NULL when `ac_total` is 0.'),
    modules_total: z
      .number()
      .int()
      .describe('Non-archived modules across every project in the workspace.'),
    modules_fully_covered: z
      .number()
      .int()
      .describe('Modules where every acceptance criterion is executed — no uncovered and no never-run criteria. Modules with no acceptance criteria at all are not counted as fully covered.'),
    project_count: z
      .number()
      .int()
      .describe('How many projects were rolled up. Zero for a workspace with no projects, and also for a workspace the caller cannot read — see the non-disclosure note on the operation.'),
  })
  .describe('A workspace-wide coverage rollup. THE ROLL-UP RULE: every acceptance criterion in the workspace counts exactly once, whichever project it belongs to (`sum(ac_bound) / sum(ac_total)` over the projects) — NOT the average of the per-project percentages, which would weight a 3-criteria project the same as a 300-criteria one. Both percentages are derived from the counts in the same payload, so a caller can recompute them instead of trusting them.')
  .openapi('WorkspaceCoverage');

const WorkspaceIdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/coverage',
  tags: ['Workspaces'],
  summary: 'Summarize test coverage across a whole workspace',
  description: 'Bearer `atc:read` (or cookie session) — coverage is a workspace-wide inventory of test assets, the same class of read the sibling Home endpoints (`/recent-projects`, `/active-runs`, `/open-bugs`) are gated on. Computed by summing `bunkai_report_project_coverage` — the SAME rollup behind `GET /api/v1/projects/{id}/coverage` and the project Metrics screen — over every project in the workspace, so the two endpoints can never disagree about whether an acceptance criterion is covered. The workspace figure is AC-weighted (`sum(ac_bound) / sum(ac_total)`), not an average of per-project percentages. The shortfall is reported as TWO separate figures on purpose: `ac_not_run` (test cases bound, never executed) and `ac_uncovered` (nothing bound at all) are different problems and a single percentage conflates them. NO trend or prior-period delta is returned: nothing in the schema records when an ATC was bound to an acceptance criterion or when a step was executed, so a historical coverage figure cannot be sourced without inventing one. Runs entirely under the caller\'s own RLS, so a foreign, nonexistent, or lost-membership workspace id returns the SAME zeroed `200` (with null percentages) that an empty workspace does — never an existence echo. A read that FAILS answers 500, never zeroes.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam],
  responses: {
    200: { description: 'The workspace\'s coverage rollup. Percentages are null when the workspace holds no acceptance criteria.', content: { 'application/json': { schema: WorkspaceCoverageSchema } } },
    400: { description: 'The workspace id in the path is not a UUID (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    500: { description: 'The rollup could not be read (`internal_error`). Deliberately not collapsed into zeroes — one unreadable project fails the whole figure rather than silently shrinking the denominator.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { WorkspaceCoverageSchema };
