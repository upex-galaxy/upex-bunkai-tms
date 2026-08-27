import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { WorkspaceSchema } from '../route.openapi';

const PatchBodySchema = z
  .object({
    name: z.string().min(1).max(80).optional().openapi({
      description: 'New display name. The only mutable field today — slug rotation is post-MVP.',
    }),
  })
  .openapi('WorkspacePatchBody', {
    description:
      'At least one field is required. An empty object `{}` parses cleanly against this schema but is rejected by the handler with 400 `bad_request` ("Provide at least one field to update."), so the constraint is not visible in the schema itself.',
  });

const SingleResponseSchema = z
  .object({ workspace: WorkspaceSchema })
  .openapi('WorkspaceResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}',
  tags: ['Workspaces'],
  summary: 'Get a single workspace',
  description: 'Bearer `atc:read` (or cookie session).',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Workspace.',
      content: { 'application/json': { schema: SingleResponseSchema } },
    },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Workspace not found or not visible.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/v1/workspaces/{id}',
  tags: ['Workspaces'],
  summary: 'Update workspace metadata',
  description: 'Owner-only. Today only `name` is mutable; slug rotation is post-MVP.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: PatchBodySchema } },
    },
  },
  responses: {
    200: {
      description: 'Updated workspace.',
      content: { 'application/json': { schema: SingleResponseSchema } },
    },
    400: { description: 'The body was not valid JSON, the path `{id}` is not a UUID, or the body was an empty object `{}` — at least one updatable field is required (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Any of: the Bearer PAT lacks the `workspace:admin` capability; the PAT is not bound to any workspace (there is no global admin — ADR-0005); the PAT is bound to a DIFFERENT workspace than `{id}`; or the caller is not an owner (RLS returns zero rows). The token-binding checks run before RLS, so a correctly-scoped RLS row does not rescue a mis-bound token. See ADR-0006.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
