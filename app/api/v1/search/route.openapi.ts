import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-398 — GET /api/v1/search. Cross-entity Command Palette search spanning
// ATCs, Tests, Projects, Modules, Bugs and Runs. Mirrors the real contract:
// query shape from `lib/search/validation.ts`, wire shape from
// `app/api/v1/search/response.ts`, auth posture from the sibling `route.ts`
// (`auth: 'required', requires: ['atc:read']`).

const SearchResultItemSchema = z
  .object({
    entity_type: z.enum(['atc', 'test', 'project', 'module', 'bug', 'run']),
    id: z.string().uuid(),
    name: z.string().describe('Display label for the row — the entity\'s title / name / slug as the RPC projected it.'),
    project_id: z.string().uuid(),
    project_slug: z.string(),
    project_name: z.string(),
    href: z.string().describe('Server-built destination path for this row (e.g. `/projects/{slug}/atcs/{id}`, `/projects/{slug}?module={id}`). Navigate to it verbatim — never reconstruct it client-side.'),
  })
  .openapi('SearchResultItem');

const SearchPageSchema = z
  .object({
    data: z.array(SearchResultItemSchema).describe('Matches across all six entity types. The RPC caps each GROUP at 5 rows regardless of `limit`, so a broad query returns at most 5 ATCs, 5 Tests, 5 Projects, and so on.'),
    truncated: z.boolean().describe('True when ANY entity group hit its 5-row cap — the signal for rendering a per-group "+ more" hint. It does not mean the whole result set was cut to `limit`.'),
  })
  .openapi('SearchPageResponse');

const SearchQuerySchema = z.object({
  q: z.string().min(2).describe('Required. Free-text query, trimmed server-side; it must be at least 2 characters AFTER trimming, so `"  a  "` fails with 422. The client is expected never to send a shorter query in the first place — this is a defensive backstop.'),
  limit: z.coerce.number().int().min(1).max(20).optional().describe('1..20, default 20. A per-request ceiling only: the underlying RPC independently caps each entity group at 5 rows, so raising `limit` never returns more than 5 of any one type.'),
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/search',
  tags: ['Search'],
  summary: 'Cross-entity workspace search',
  description: 'Bearer `atc:read` (or cookie session). Searches ATCs, Tests, Projects, Modules, Bugs and Runs inside ONE workspace and returns up to 5 matches per entity type, each with a ready-to-navigate `href`.\n\nThere is deliberately no workspace path segment and no workspace query parameter — the caller is never the authority on scope. A cookie session is scoped to its active workspace (the `bk_active_ws` cookie, falling back to the caller\'s oldest workspace); a Bearer PAT is scoped to the workspace it was issued against.\n\nScope failures never disclose existence: an unknown, foreign or inaccessible workspace and a query with no matches all return the same `200 { "data": [], "truncated": false }`. This route answers no 403 or 404 for scope reasons.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: { query: SearchQuerySchema },
  responses: {
    200: { description: 'Matches, grouped-capped and possibly empty.', content: { 'application/json': { schema: SearchPageSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'The Bearer PAT does not carry the `atc:read` scope (`forbidden`). Enforced by the gateway before the handler runs; cookie sessions hold every capability and never hit this.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Any of: `q` missing or shorter than 2 characters after trimming; `limit` not an integer in 1..20 (`validation_failed`). ALSO returned — unlike every other workspace-scoped route, which answers 403 — when a Bearer PAT is not bound to any workspace, or when a cookie session has no resolvable active workspace.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { SearchResultItemSchema };
