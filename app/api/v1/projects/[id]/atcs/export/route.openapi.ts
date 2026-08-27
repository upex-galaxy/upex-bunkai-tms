import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-315 — a Project's whole ATC library as an RFC4180 CSV download. No
// pagination, no row cap (AI Tech Lead decision, Jira BK-315): a buffered
// single-response body, sufficient for an occasional, human-triggered audit
// pull. Non-disclosure: missing, foreign-workspace, and non-member Projects
// all collapse into the SAME 404 (`not_found`), never a 403, never an
// existence leak — mirrors every sibling project-scoped reporting endpoint.

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
  description: 'The Project whose ATC library to export.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/atcs/export',
  tags: ['ATCs'],
  summary: 'Export a Project\'s whole ATC library as a CSV file',
  description: 'Bearer `atc:read` (or cookie session). Columns, fixed order: ATC ID, Slug, Title, Module, Layer, Tags, Status. Multiple Tags for one ATC join into a single cell with `; ` (semicolon-space). Any cell containing a comma, a double quote, or a line break is RFC4180-quoted, with embedded double quotes doubled. A Project with zero ATCs returns a header-only CSV (200, never an error). No pagination, no row cap.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'The Project\'s ATC library as CSV, `Content-Disposition: attachment`.',
      content: { 'text/csv': { schema: z.string() } },
    },
    400: { description: 'Malformed Project id (not a UUID) (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found (also returned for a Project outside the caller\'s workspaces — no existence leak).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
