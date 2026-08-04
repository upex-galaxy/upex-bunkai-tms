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
      .describe('How many of `ac_bound` are currently verified: at least one ATC is linked AND no linked ATC is still pending in its most recent run. POINT-IN-TIME, NOT CUMULATIVE — this is not a count of criteria that have ever been executed. Each ATC resolves to the status of its most recent run only, and adding an ATC to a newly created run resets it to pending, so this figure legitimately falls when a team opens a regression run and rises again as they work through it. Always <= `ac_bound`.'),
    ac_not_run: z
      .number()
      .int()
      .describe('Bound but not currently verified — `ac_bound - ac_executed`: at least one linked ATC is pending in its most recent run. Kept as its own figure because "test cases exist but are not verified right now" is a different problem from "no test cases exist", and a single coverage percentage hides the difference. Note this does NOT mean "never executed": an ATC with a long execution history returns to this bucket as soon as it joins a new run.'),
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
      .describe('`ac_executed / ac_total` as a whole percent, rounded half-up — the stricter reading, counting only acceptance criteria whose coverage is verified right now. Matches the per-project Metrics screen\'s "Executed coverage" tile. Inherits `ac_executed`\'s point-in-time semantics, so do NOT treat a drop in this figure as lost coverage: opening a regression run over already-tested criteria lowers it by design. `ac_coverage_percent` is the stable one. NULL when `ac_total` is 0.'),
    modules_total: z
      .number()
      .int()
      .describe('Non-archived modules across every project in the workspace.'),
    modules_fully_covered: z
      .number()
      .int()
      .describe('Modules where every acceptance criterion is currently verified — none uncovered and none awaiting execution. Modules with no acceptance criteria at all are not counted as fully covered.'),
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
  description: 'Bearer `atc:read` (or cookie session) — coverage is a workspace-wide inventory of test assets, the same class of read the sibling Home endpoints (`/recent-projects`, `/active-runs`, `/open-bugs`) are gated on. Computed by summing `bunkai_report_project_coverage` — the SAME rollup behind `GET /api/v1/projects/{id}/coverage` and the project Metrics screen — over every project in the workspace, so the two endpoints can never disagree about whether an acceptance criterion is covered. The workspace figure is AC-weighted (`sum(ac_bound) / sum(ac_total)`), not an average of per-project percentages. The shortfall is reported as TWO separate figures on purpose: `ac_not_run` (test cases bound, awaiting execution) and `ac_uncovered` (nothing bound at all) are different problems and a single percentage conflates them. Execution state is POINT-IN-TIME, not cumulative — each ATC counts by its most recent run only, and joining a new run resets it to pending — so `ac_executed` and `executed_coverage_percent` fall when a regression run opens and are not a history of what has ever been tested; `ac_coverage_percent` is the figure that only moves when coverage itself does. A successful response may be up to 60 seconds stale (the rollup is memoized per workspace to keep this off the hot path of every landing-page load); adding or removing a project invalidates it at once. NO trend or prior-period delta is returned: nothing in the schema records when an ATC was bound to an acceptance criterion or when a step was executed, so a historical coverage figure cannot be sourced without inventing one. Runs entirely under the caller\'s own RLS, so a foreign, nonexistent, or lost-membership workspace id returns the SAME zeroed `200` (with null percentages) that an empty workspace does — never an existence echo. A read that FAILS answers 500, never zeroes.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [WorkspaceIdParam],
  responses: {
    200: { description: 'The workspace\'s coverage rollup. Percentages are null when the workspace holds no acceptance criteria.', content: { 'application/json': { schema: WorkspaceCoverageSchema } } },
    400: { description: 'The workspace id in the path is not a UUID (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    500: { description: 'The rollup could not be read (`internal_error`). Deliberately not collapsed into zeroes — one unreadable project fails the whole figure rather than silently shrinking the denominator. Also returned, for the same reason, when the workspace holds more projects than one pass may roll up (60): a percentage over some of a workspace\'s projects is a wrong number that looks like a right one, so the endpoint refuses instead of approximating.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { WorkspaceCoverageSchema };
