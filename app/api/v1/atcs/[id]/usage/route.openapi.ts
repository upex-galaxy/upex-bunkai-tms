import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-22 — one entry per distinct Test that chains the ATC. `positions` lists
// every position the ATC occupies in that Test (ascending); the same ATC at
// multiple positions in one Test yields ONE entry with multiple positions, and
// `count` is the distinct-Test total. No `slug`: the `tests` table has only
// id/title (see migration 0029), so entries surface `title`, ordered by title.
const AtcUsageEntrySchema = z
  .object({
    test_id: z.string().uuid(),
    title: z.string().describe('The Test title (Tests have no slug — ordered by title asc).'),
    positions: z.array(z.number().int()).describe('Ascending positions the ATC occupies in this Test.'),
  })
  .openapi('AtcUsageEntry');

const AtcUsageReportSchema = z
  .object({
    count: z.number().int().describe('Number of distinct Tests that chain this ATC.'),
    used_in: z.array(AtcUsageEntrySchema),
  })
  .openapi('AtcUsageReport');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'The ATC to report usage for.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/atcs/{id}/usage',
  tags: ['ATCs'],
  summary: 'Report which Tests chain an ATC ("used in N tests")',
  description: 'Bearer `atc:read` (or cookie session). Returns the distinct Tests that chain this ATC — each with the positions the ATC occupies — plus a `count` of distinct Tests, ordered by Test title. Results are confined to the ATC\'s own workspace (Tests are workspace-scoped) and the caller must be an active member of it. A reachable ATC with no chaining Tests returns `count: 0` + an empty `used_in` (never 404). A nonexistent, archived, or cross-workspace ATC returns a uniform 404 (no existence leak).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'Usage report (possibly empty).', content: { 'application/json': { schema: AtcUsageReportSchema } } },
    400: { description: 'Malformed id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'ATC not found (also returned for an ATC outside the caller\'s workspaces — no existence leak).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { AtcUsageEntrySchema, AtcUsageReportSchema };
