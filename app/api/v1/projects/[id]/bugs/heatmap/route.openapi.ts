import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-42 — a Project's per-module defect heatmap: defect count over a chosen
// window (7d/30d/90d, default 30d) plus a week-over-week trend per module.
// No pagination — the whole-project payload is small and bounded, same
// shape as `GET /api/v1/projects/{id}/metrics/recovery-cycles` and
// `GET /api/v1/projects/{id}/coverage` (0052_defect_heatmap_report.sql).
//
// `heat`: Clean (0) / Low (1-2) / Elevated (3-4) / Hotspot (5+) — the exact
// tier boundaries frozen in the Bug Reports mockup's legend
// (master-design-plan §4.6). `trend_pct` is null exactly when
// `previous_week_count` is 0 and `current_week_count` is positive (the AC
// boundary scenario — "not applicable or null rather than infinity");
// otherwise it is the signed percent change. `trend_delta` is always the
// absolute count difference and is what the UI actually renders
// ("Rising +N" / "Falling -N" / "Flat +-0" — never a raw percentage, per the
// frozen mockup grammar).

const DefectHeatmapItemSchema = z
  .object({
    module_id: z.string().uuid(),
    module_name: z.string(),
    module_path: z.string().describe('Full slash-separated module path, so identically-named nested modules stay distinguishable.'),
    defect_count: z.number().int().describe('Defect count for this module (including its full descendant subtree) within the selected window.'),
    heat: z.enum(['clean', 'low', 'elevated', 'hotspot']).describe('Clean: 0. Low: 1-2. Elevated: 3-4. Hotspot: 5+ (master-design-plan §4.6).'),
    current_week_count: z.number().int().describe('Defect count in the latest rolling 7-day UTC bucket (independent of the selected window).'),
    previous_week_count: z.number().int().describe('Defect count in the immediately preceding 7-day UTC bucket.'),
    trend_direction: z.enum(['rising', 'falling', 'flat']),
    trend_delta: z.number().int().describe('current_week_count - previous_week_count. Always present, always finite.'),
    trend_pct: z.number().nullable().describe('Signed percent change. Null exactly when previous_week_count is 0 and current_week_count is positive (never Infinity) — a 0/0 pair reads 0, not null.'),
  })
  .openapi('DefectHeatmapItem');

const DefectHeatmapReportSchema = z
  .object({
    window: z.enum(['7d', '30d', '90d']),
    generated_at: z.string().datetime({ offset: true }).describe('Freshness timestamp for this read — a live, unpaginated query, not a cached snapshot.'),
    items: z.array(DefectHeatmapItemSchema).describe('One cell per ACTIVE (non-archived) module, ordered by module path then id.'),
  })
  .openapi('DefectHeatmapReport');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'The Project whose defect heatmap to read.',
};

const WindowParam = {
  name: 'window',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const, enum: ['7d', '30d', '90d'], default: '30d' },
  description: 'The rollup window for defect_count. Defaults to 30d. An unsupported value is a 400 bad_request (not the repo\'s usual validation_failed/422 — AC-11\'s explicit wording for this error).',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/bugs/heatmap',
  tags: ['Bugs'],
  summary: 'Compute a per-module defect heatmap (count + week-over-week trend) for a chosen window',
  description: 'Cookie session or Bearer PAT; no scope requirement — mirrors GET /api/v1/projects/{id}/metrics/recovery-cycles. One SECURITY DEFINER RPC (`bunkai_report_project_defect_heatmap`) resolves the Project\'s workspace and re-checks ACTIVE membership in-band; any role reads, viewers included. No pagination or filters: the whole-project rollup is small and bounded. Each module\'s defect_count rolls up its full descendant subtree (path-prefix match); archived modules are excluded from the heatmap by default but a filed defect against a since-archived descendant still counts toward an active ancestor. A Project with zero bugs returns every active module at Clean/0 (never a 404) — a 404 means the Project itself is missing, foreign, or unreadable.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, WindowParam],
  responses: {
    200: { description: 'The defect heatmap report.', content: { 'application/json': { schema: DefectHeatmapReportSchema } } },
    400: { description: 'Malformed Project id (not a UUID), or an unsupported window value (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found (also returned for a Project outside the caller\'s workspaces — no existence leak).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { DefectHeatmapItemSchema, DefectHeatmapReportSchema };
