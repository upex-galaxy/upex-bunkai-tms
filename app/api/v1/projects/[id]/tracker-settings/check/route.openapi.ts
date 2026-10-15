import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-371 — "Run connection check" for the Jira defect sync. Read-only against
// Jira, creates nothing, saves nothing. A failed check is a 200 with ok:false.

const CheckBodySchema = z
  .object({
    destination_project_key: z.string().describe('Trimmed and upper-cased (ASCII) by the server; validated before any request to Jira.'),
    issue_type_name: z.string().optional().describe('Trimmed, 1-60 characters. Defaults to "Bug".'),
  })
  .openapi('ProjectTrackerCheckBody');

const CheckReasonSchema = z
  .object({
    kind: z
      .enum(['not_set_up', 'credential_rejected', 'project_inaccessible', 'issue_type_missing', 'unreachable', 'jira_busy'])
      .describe('Closed list. 404 and 403 from Jira share `project_inaccessible` so existence is not disclosed.'),
    message: z.string().describe('Fixed copy; only the key and the typed issue type name are interpolated.'),
  })
  .openapi('ProjectTrackerCheckReason');

const CheckResponseSchema = z
  .object({
    ok: z.boolean(),
    reason: CheckReasonSchema.nullable().describe('Null when ok.'),
  })
  .openapi('ProjectTrackerCheckResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/projects/{id}/tracker-settings/check',
  tags: ['Tracker settings'],
  summary: 'Check the Jira destination of a Project',
  description:
    'Owner or admin only (scope `workspace:admin` plus a live role check): the check asks the shared Jira site whether a key exists, so members and viewers are refused with no request to Jira. One read-only call, a 5 second budget, no retry. One check at a time per person: a concurrent second call answers 429 (`details.reason` `check_in_progress`).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: { required: true, content: { 'application/json': { schema: CheckBodySchema } } },
  },
  responses: {
    200: { description: 'The check ran. `ok: false` carries the reason; it is not an HTTP error.', content: { 'application/json': { schema: CheckResponseSchema } } },
    400: { description: 'Malformed project id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing workspace:admin scope, a token scoped to another workspace, or the caller is not an owner or admin (`details.reason` `admin_required`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found, or not visible to the caller.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Malformed key or issue type (`invalid_destination_key`, `destination_required`, `invalid_issue_type`). No request was sent to Jira.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    429: { description: 'A check by the same person is already running (`details.reason` `check_in_progress`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
