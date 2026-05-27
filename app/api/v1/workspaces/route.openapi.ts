import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const WorkspaceSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    owner_user_id: z.string().uuid(),
    plan: z.enum(['community', 'cloud', 'enterprise']),
    created_at: z.string().datetime(),
  })
  .openapi('Workspace');

const CreateBodySchema = z
  .object({
    name: z.string().min(1).max(80).openapi({ example: 'Acme QA' }),
    slug: z.string().min(3).max(40).openapi({ example: 'acme-qa' }),
  })
  .openapi('WorkspaceCreateBody');

const CreateResponseSchema = z
  .object({ workspace: WorkspaceSchema })
  .openapi('WorkspaceCreateResponse');

const ListResponseSchema = z
  .object({ workspaces: z.array(WorkspaceSchema) })
  .openapi('WorkspaceListResponse');

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces',
  tags: ['Workspaces'],
  summary: 'Create workspace + auto-enrol caller as owner',
  description:
    'Wraps the `bunkai_bootstrap_workspace` SECURITY DEFINER RPC so the workspace row and the owner-membership row are inserted in a single transaction.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Workspace created.',
      content: { 'application/json': { schema: CreateResponseSchema } },
    },
    401: {
      description: 'Caller is not signed in.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    409: {
      description: 'Slug already in use.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
    422: {
      description: 'Request body failed validation.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces',
  tags: ['Workspaces'],
  summary: 'List workspaces the caller belongs to',
  description: 'RLS-filtered list of every workspace where the caller has an active membership.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  responses: {
    200: {
      description: 'Workspace list.',
      content: { 'application/json': { schema: ListResponseSchema } },
    },
    401: {
      description: 'Caller is not signed in.',
      content: { 'application/json': { schema: ErrorEnvelopeSchema } },
    },
  },
});

export { WorkspaceSchema };
