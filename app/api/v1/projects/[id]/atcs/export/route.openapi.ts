import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-315 — a Project's whole ATC library as an RFC4180 CSV download. No row
// cap and no client-facing pagination (AI Tech Lead decision, Jira BK-315): a
// single buffered response, sufficient for an occasional, human-triggered
// audit pull. The server DOES page its own read of `atcs` past PostgREST's
// `db-max-rows` cap internally (Conductor review of PR #207, BLOCKER fix) so
// a library larger than 1000 rows is never silently truncated — that paging
// is not exposed to the caller. Non-disclosure: missing, foreign-workspace,
// and non-member Projects all collapse into the SAME 404 (`not_found`),
// never a 403, never an existence leak — mirrors every sibling project-scoped
// reporting endpoint.

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
  description: 'Bearer `atc:read` (or cookie session). Columns, fixed order: ATC ID, Slug, Title, Module, Layer, Tags, Status. Multiple Tags for one ATC join into a single cell with `; ` (semicolon-space). Any cell containing a comma, a double quote, or a line break is RFC4180-quoted, with embedded double quotes doubled. A cell whose content starts with `=`, `+`, `-`, `@`, a tab, or a CR is prefixed with a literal `\'` before that escaping, to neutralize spreadsheet formula injection (OWASP guidance). The body is prefixed with a UTF-8 BOM so non-ASCII Title/Tag content renders correctly in Windows Excel. A Project with zero ATCs returns a header-only CSV (200, never an error). No row cap: every non-archived ATC is included regardless of library size.',
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
