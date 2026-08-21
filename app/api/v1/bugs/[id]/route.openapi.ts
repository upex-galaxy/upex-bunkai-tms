import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { BugDetailSchema } from '../route.openapi';

// BK-337 — a single defect's full composed record. Reuses `BugDetailSchema`
// (the shape `bunkai_bug_json` composes, also returned by POST /bugs, POST
// /bugs/{id}/assign, and POST /bugs/{id}/status).

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/bugs/{id}',
  tags: ['Bugs'],
  summary: 'Read a single defect\'s full record',
  description: 'Bearer `atc:read` (or cookie session). Any active workspace role, viewers included, may read (`bugs_select_workspace_member`, migration 0046). `bunkai_bug_json` is SECURITY INVOKER — it runs under the caller\'s own RLS, so a bug outside the caller\'s workspaces returns the same 404 as an unknown id (non-disclosing). A bug filed against a since-archived module still renders in full, with `module.archived_at` set — this read does NOT apply the archived-module exclusion the list endpoints use.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'The defect\'s full record.', content: { 'application/json': { schema: z.object({ bug: BugDetailSchema }) } } },
    400: { description: 'Malformed id — not a UUID (`bad_request`). Computed from the string alone, no database access.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Bug not found — also returned for a well-formed id in a workspace the caller is not a member of (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
