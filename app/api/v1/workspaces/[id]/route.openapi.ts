import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { WorkspaceSchema } from '../route.openapi';

const PatchBodySchema = z
  .object({ name: z.string().min(1).max(80).optional() })
  .openapi('WorkspacePatchBody');

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
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: {
      description: 'Workspace.',
      content: { 'application/json': { schema: SingleResponseSchema } },
    },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
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
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Caller is not an owner.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
