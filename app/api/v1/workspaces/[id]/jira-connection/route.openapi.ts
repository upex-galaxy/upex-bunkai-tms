import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-1170 — the workspace's own Jira connection. The API token is WRITE-ONLY:
// it is accepted by PUT, stored encrypted in Supabase Vault, and never returned
// by any route.

const ConnectionSchema = z
  .object({
    connected: z.boolean().describe('Whether the workspace has a Jira connection.'),
    site_url: z.string().optional().describe('https://<name>.atlassian.net. Owner / admin only.'),
    email: z.string().optional().describe('Atlassian account email. Owner / admin only.'),
    has_token: z.boolean().optional().describe('True when a token is stored. The token itself is never returned. Owner / admin only.'),
    updated_at: z.string().datetime().optional().describe('Owner / admin only.'),
    updated_by: z.string().uuid().nullable().optional().describe('User who last saved the connection. Owner / admin only on GET.'),
  })
  .openapi('WorkspaceJiraConnection');

const ConnectionResponseSchema = z
  .object({ jira_connection: ConnectionSchema })
  .openapi('WorkspaceJiraConnectionResponse');

const PutBodySchema = z
  .object({
    site_url: z.string().describe('Jira Cloud site, https://<name>.atlassian.net. Trimmed, lower-cased and stripped of a trailing slash; anything else is rejected (`invalid_site_url`).'),
    email: z.string().email().max(254).describe('Email of the Atlassian account that owns the API token.'),
    api_token: z.string().min(1).max(2048).optional().describe('Write-only. Required on the first save and whenever the site URL changes; omit it to change only the email. Never returned.'),
  })
  .openapi('WorkspaceJiraConnectionPutBody');

const CheckBodySchema = z
  .object({
    site_url: z.string().optional(),
    email: z.string().email().max(254).optional(),
    api_token: z.string().min(1).max(2048).optional().describe('Write-only; never returned or logged.'),
  })
  .openapi('WorkspaceJiraConnectionCheckBody');

const CheckResponseSchema = z
  .object({
    ok: z.boolean(),
    reason: z
      .object({
        kind: z.enum(['unauthorized_401', 'forbidden_403', 'site_not_found', 'jira_busy', 'site_unreachable', 'unexpected_status', 'not_connected']),
        message: z.string().describe('Constant copy; never contains the email, token, host or Jira response.'),
      })
      .nullable(),
  })
  .openapi('WorkspaceJiraConnectionCheckResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/jira-connection',
  tags: ['Jira connection'],
  summary: 'Read the workspace\'s Jira connection',
  description:
    'Any active workspace member. Members see only `{ connected }`; owners and admins also see `site_url`, `email`, `has_token`, `updated_at` and `updated_by`. The API token is never returned.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'The connection state.', content: { 'application/json': { schema: ConnectionResponseSchema } } },
    400: { description: 'Malformed workspace id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope, or a token scoped to another workspace.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found, or the caller is not an active member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/workspaces/{id}/jira-connection',
  tags: ['Jira connection'],
  summary: 'Save the workspace\'s Jira connection',
  description:
    'Owner or admin only (scope `workspace:admin` plus a live role check). The `api_token` is write-only: it is stored encrypted in Supabase Vault and never returned. It is required on the first save and whenever `site_url` changes. Saving does not call Jira; use the check route to test it.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: { required: true, content: { 'application/json': { schema: PutBodySchema } } },
  },
  responses: {
    200: { description: 'Saved.', content: { 'application/json': { schema: ConnectionResponseSchema } } },
    400: { description: 'Malformed workspace id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing workspace:admin scope, a token scoped to another workspace, or the caller is not an owner or admin (`details.reason` `admin_required`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found, or not visible to the caller.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed. `details.reason` is `invalid_site_url`, `invalid_email`, `token_required` or `invalid_body`.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/workspaces/{id}/jira-connection',
  tags: ['Jira connection'],
  summary: 'Disconnect the workspace from Jira',
  description:
    'Owner or admin only. Removes the connection and deletes the stored API token. Jira imports and defect sync stop working for the workspace until it is connected again.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    204: { description: 'Disconnected.' },
    400: { description: 'Malformed workspace id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing workspace:admin scope, or the caller is not an owner or admin (`details.reason` `admin_required`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found, or it has no Jira connection (`details.reason` `not_connected`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/jira-connection/check',
  tags: ['Jira connection'],
  summary: 'Test a Jira connection',
  description:
    'Owner or admin only. Send nothing to test the stored connection, or all of `site_url`, `email` and `api_token` to test unsaved values (a partial body is a 422 `incomplete_body`). The site URL is validated before any request, so only https://<name>.atlassian.net is contacted. A failed test is a 200 with `ok: false`. The token is never returned. One check at a time per person (429 `check_in_progress`).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: { required: false, content: { 'application/json': { schema: CheckBodySchema } } },
  },
  responses: {
    200: { description: 'The outcome of the check.', content: { 'application/json': { schema: CheckResponseSchema } } },
    400: { description: 'Malformed workspace id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing workspace:admin scope, or the caller is not an owner or admin (`details.reason` `admin_required`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found, or not visible to the caller.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed. `details.reason` is `invalid_site_url`, `invalid_email`, `token_required`, `incomplete_body` or `invalid_body`.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    429: { description: 'A check by the same person is already running (`details.reason` `check_in_progress`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
