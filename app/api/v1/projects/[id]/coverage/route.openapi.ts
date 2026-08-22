import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-46 — a Project's coverage rollup: modules with untested/uncovered
// acceptance criteria and a "never run" indicator. No pagination, no query
// params — the whole-project payload is small and bounded, and the UI
// filters client-side (Technical Decision, 0048_project_coverage_report.sql).
//
// Coverage-state model (PO decisions Q1/Q2/Q3): an AC is `uncovered` (zero
// linked non-archived ATCs), `not_run` (>=1 linked ATC, at least one
// `unrun`), or `executed` (>=1 linked ATC, none `unrun`). A module is
// `fully_covered` only when every one of its ACs is `executed`.

const CoverageKpisSchema = z
  .object({
    ac_total: z.number().int(),
    ac_bound: z.number().int().describe('ac_total minus the uncovered count — ACs with at least one linked ATC, run or not.'),
    ac_executed: z.number().int(),
    modules_total: z.number().int(),
    modules_fully_covered: z.number().int(),
  })
  .openapi('CoverageKpis');

const CoverageModuleSchema = z
  .object({
    module_id: z.string().uuid(),
    module_name: z.string(),
    ac_total: z.number().int(),
    ac_uncovered: z.number().int(),
    ac_not_run: z.number().int(),
    ac_executed: z.number().int(),
    status: z
      .enum(['uncovered', 'not_run', 'fully_covered', 'no_acs'])
      .describe('uncovered: at least one AC has zero linked ATCs. not_run: zero uncovered ACs, at least one AC is not_run. fully_covered: every AC is executed. no_acs: the module has zero User Stories/Acceptance Criteria.'),
  })
  .openapi('CoverageModule');

const CoverageNoCoverageItemSchema = z
  .object({
    ac_id: z.string().uuid(),
    ac_title: z.string(),
    user_story_id: z.string().uuid(),
    user_story_title: z.string(),
    module_id: z.string().uuid(),
    module_name: z.string(),
  })
  .openapi('CoverageNoCoverageItem');

const CoveragePayloadSchema = z
  .object({
    kpis: CoverageKpisSchema,
    modules: z.array(CoverageModuleSchema).describe('Every non-archived Module of the Project, ordered by position — including modules with zero ACs (`status: "no_acs"`).'),
    no_coverage: z.array(CoverageNoCoverageItemSchema).describe('Every `uncovered` AC, itemized. The client collapses an entirely-unbound module\'s ACs into one summary row (lib/coverage/coverage-view.ts).'),
  })
  .openapi('CoveragePayload');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'The Project whose coverage rollup to read.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/coverage',
  tags: ['Coverage'],
  summary: 'Surface a Project\'s untested acceptance criteria and modules, with a never-run indicator',
  description: 'Bearer `atc:read` (or cookie session). Mirrors `GET /api/v1/projects/{id}/runs/report`. One SECURITY DEFINER RPC (`bunkai_report_project_coverage`) resolves the Project\'s workspace and re-checks ACTIVE membership in-band; any role reads, viewers included (PO decision Q5 — this is not a privileged QA-only screen). No pagination or query parameters: the whole-project rollup is small and bounded, and the UI filters the returned payload client-side. A Project with zero acceptance criteria returns zeroed `kpis` and empty arrays (never a 404) — a 404 means the Project itself is missing, foreign, or unreadable.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'The Project\'s coverage rollup.', content: { 'application/json': { schema: CoveragePayloadSchema } } },
    400: { description: 'Malformed Project id (not a UUID) (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found (also returned for a Project outside the caller\'s workspaces — no existence leak).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { CoverageKpisSchema, CoverageModuleSchema, CoverageNoCoverageItemSchema, CoveragePayloadSchema };
