import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-203 — GET /api/v1/tests/search. New Tests-domain endpoint (sibling of
// /api/v1/atcs/search) — the Tests domain previously exposed only single-tag
// exact filtering (GET /api/v1/tests?tag=).

const TestSearchResultSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    tags: z.array(z.string()),
  })
  .openapi('TestSearchResult');

const SearchQuerySchema = z.object({
  query: z.string().min(1).describe('Free-text query matched (substring, case-insensitive) against Test title and tags.'),
  project_id: z.string().uuid().describe('Required. Scopes the search to a single project, derived from each Test\'s chained ATCs; a project outside the caller\'s active workspaces returns no rows.'),
  limit: z.coerce.number().int().min(1).max(50).optional().describe('1..50, default 20.'),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/tests/search',
  tags: ['Tests'],
  summary: 'Search Tests by title and tags',
  description: 'Bearer `atc:read` (or cookie session). Project-scoped substring search over Test title and tags. A Test has no project_id of its own (Tests are workspace-scoped); the project match is derived from the Test\'s chained ATCs. Results are restricted to the caller\'s active workspace memberships AND to the required `project_id`. Zero matches return an empty `items` array (never 404).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: { query: SearchQuerySchema },
  responses: {
    200: { description: 'Matches (possibly empty), newest first.', content: { 'application/json': { schema: z.object({ items: z.array(TestSearchResultSchema) }) } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (empty/missing query, missing/invalid project_id, bad limit).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { TestSearchResultSchema };
