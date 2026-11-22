import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-228 — a Project's repository URL (for the CI-context "commit" link). Read
// (any member or viewer) and write (owner / admin only). BK-2327: this route
// shipped with BK-228 but was never registered here, so it was absent from the
// published OpenAPI document while the sibling tracker-settings route was present.

const RepositorySettingsSchema = z
  .object({
    repository_url: z.string().nullable().describe('An https URL with no credentials, trimmed. Null when never configured or cleared.'),
    updated_at: z.string().datetime().nullable(),
  })
  .openapi('ProjectRepositorySettings');

const GetResponseSchema = z
  .object({ repository_settings: RepositorySettingsSchema })
  .openapi('ProjectRepositorySettingsResponse');

const PutBodySchema = z
  .object({
    repository_url: z.string().nullable().describe('An https URL with no credentials, or null (and an empty or whitespace-only string) to clear it.'),
  })
  .openapi('ProjectRepositorySettingsPutBody');

const PutResponseSchema = z
  .object({ repository_settings: RepositorySettingsSchema })
  .openapi('ProjectRepositorySettingsPutResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/projects/{id}/repository-settings',
  tags: ['Repository settings'],
  summary: 'Read a Project\'s repository URL',
  description:
    'Any workspace member or viewer. A Project that was never configured answers no URL. A Project the caller cannot see answers the same 404 as a missing one.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'The repository URL (or null).', content: { 'application/json': { schema: GetResponseSchema } } },
    400: { description: 'Malformed project id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found, or not visible to the caller.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/projects/{id}/repository-settings',
  tags: ['Repository settings'],
  summary: 'Save a Project\'s repository URL',
  description:
    'Owner or admin only (scope `workspace:admin` plus a live role check). `repository_url` is required: an https URL with no embedded credentials, trimmed; null, or an empty or whitespace-only string, clears it.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: { required: true, content: { 'application/json': { schema: PutBodySchema } } },
  },
  responses: {
    200: { description: 'Saved; the stored URL.', content: { 'application/json': { schema: PutResponseSchema } } },
    400: { description: 'Malformed project id or invalid JSON body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing workspace:admin scope, a token scoped to another workspace, or the caller is not an owner or admin (`details.reason` `admin_required`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found, or not visible to the caller.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed. `details.reason` is `repository_url_invalid`, `details.field` `repository_url` (not an https URL, or it carries credentials).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { RepositorySettingsSchema };
