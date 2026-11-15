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

// BK-1835 — correct a filed defect's content.
const BugCorrectionBodySchema = z
  .object({
    expected_version: z.number().int().min(1).describe('The defect\'s `content_version` as the caller loaded it.'),
    title: z.string().min(5).max(200).optional().describe('Trimmed, then 5 to 200 characters (the filing rule).'),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
    description: z.string().optional().describe('Trimmed; an empty value clears the description. No explicit size limit, the same as filing.'),
    steps_to_reproduce: z.string().optional().describe('Stored as typed, the same as filing.'),
  })
  .strict()
  .openapi('BugCorrectionBody');

registry.registerPath({
  method: 'patch',
  path: '/api/v1/bugs/{id}',
  tags: ['Bugs'],
  summary: 'Correct a defect\'s title, severity, description and steps',
  description: 'Bearer `atc:write` (or cookie session); member+ write access, in any status including closed. `bunkai_correct_bug` (migration 0129) writes only these four fields: status, assignee, evidence, Run, step, ATC and Module never change, and any other key in the body is refused (422). Send at least one field plus `expected_version`. A save whose values equal the current ones (a title differing only by surrounding spaces included) writes nothing and returns `changed: false`. An effective correction bumps `content_version` and emits ONE `bug.corrected` activity entry naming every changed field. A save from an older `content_version` is refused with 409 and `details.current` holds the current defect.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: { body: { required: true, content: { 'application/json': { schema: BugCorrectionBodySchema } } } },
  responses: {
    200: { description: 'Saved (or nothing to save). Returns the current defect and whether anything changed.', content: { 'application/json': { schema: z.object({ bug: BugDetailSchema, changed: z.boolean() }) } } },
    400: { description: 'Malformed id (not a UUID) or malformed JSON body (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or a workspace member without write access, such as a Viewer (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Bug not found, also returned for a caller who is not a member of the bug\'s workspace (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The defect changed since `expected_version` was read (`conflict`, `details.reason: bug_changed`). `details.current` carries the current defect.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed: the title or severity breaks the filing rules, a field outside the four is present, or no field was sent.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
