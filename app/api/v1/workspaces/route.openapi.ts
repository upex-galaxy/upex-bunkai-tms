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

// BK-89: list-response-only schema — the caller's `role` per workspace is
// computed for GET /api/v1/workspaces alone (a second workspace_members
// query), so it must not widen the shared WorkspaceSchema used by POST's
// create-response and by GET /api/v1/workspaces/[id], neither of which
// computes `role`.
const WorkspaceWithRoleSchema = WorkspaceSchema
  .extend({ role: z.enum(['viewer', 'member', 'admin', 'owner']).nullable() })
  .openapi('WorkspaceWithRole');

const ListResponseSchema = z
  .object({ workspaces: z.array(WorkspaceWithRoleSchema) })
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
  description: 'Bearer `atc:read` (or cookie session). RLS-filtered list of every workspace where the caller has an active membership.',
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
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { WorkspaceSchema };
