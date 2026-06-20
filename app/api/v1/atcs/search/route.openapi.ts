import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-20 — GET /api/v1/atcs/search. Lightweight search-result row (a subset of
// the full ATC: enough to render an autocomplete entry and link to the ATC).
const AtcSearchResultSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    layer: z.enum(['UI', 'API', 'Unit']),
    status: z.enum(['pass', 'fail', 'blocked', 'skipped', 'running', 'unrun']),
    module_path: z.string().describe('Slash-separated module breadcrumb.'),
  })
  .openapi('AtcSearchResult');

const SearchQuerySchema = z.object({
  query: z.string().min(1).describe('Free-text query matched against ATC title + tags. Single token is prefix-aware (autocomplete); multiple words use AND semantics.'),
  project_id: z.string().uuid().describe('Required. Scopes the search to a single project; a project outside the caller\'s active workspaces returns no rows.'),
  module_id: z.string().uuid().optional().describe('Narrow results to this module and its descendant subtree.'),
  layer: z.enum(['UI', 'API', 'Unit']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().describe('1..50, default 20.'),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/atcs/search',
  tags: ['ATCs'],
  summary: 'Search ATCs by title and tags',
  description: 'Bearer `atc:read` (or cookie session). Project-scoped full-text search over ATC title + tags, ranked by relevance with a 7-day recency tie-break, optionally narrowed by a module subtree and/or layer. Results are restricted to the caller\'s active workspace memberships AND to the required `project_id`; a project outside those memberships returns no rows. Zero matches return an empty `items` array (never 404).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: { query: SearchQuerySchema },
  responses: {
    200: { description: 'Ranked matches (possibly empty).', content: { 'application/json': { schema: z.object({ items: z.array(AtcSearchResultSchema) }) } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (empty/missing query, missing/invalid project_id, bad limit, bad layer).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { AtcSearchResultSchema };
