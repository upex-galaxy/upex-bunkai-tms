import { IDEMPOTENCY_400, IDEMPOTENCY_409, IdempotencyKeyParam } from '@lib/openapi/idempotency';
import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const ProjectSchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    workspace_id: z.string().uuid(),
    created_at: z.string().datetime(),
  })
  .openapi('Project');

const CreateBodySchema = z
  .object({
    name: z.string().describe('3–80 chars, at least one alphanumeric. Slug is auto-derived; names mapping to a reserved slug (api, new, settings, …) are rejected.'),
    description: z.string().optional().describe('Optional Markdown, max 5KB.'),
  })
  .openapi('ProjectCreateBody');

const CreateResponseSchema = z
  .object({ project: ProjectSchema })
  .openapi('ProjectCreateResponse');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/projects',
  tags: ['Projects'],
  summary: 'Create a project in a workspace',
  description:
    'Bearer `atc:write` (or cookie session). Member-only (role >= member). Auto-derives a per-workspace-unique slug from the name. Duplicate slug returns 409; non-members return 403 `not_a_member` and a Viewer returns 403 `forbidden_role`.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, IdempotencyKeyParam],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CreateBodySchema } },
    },
  },
  responses: {
    201: {
      description: 'Project created.',
      content: { 'application/json': { schema: CreateResponseSchema } },
    },
    400: { description: `Malformed workspace id or invalid JSON body, or: ${IDEMPOTENCY_400}`, content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Caller is not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, a caller who is not a member of the workspace (`not_a_member`), or a Viewer (`forbidden_role`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: `A project with this slug already exists in the workspace, or: ${IDEMPOTENCY_409}`, content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Validation failed (including names that map to a reserved slug), or the workspace\'s effective plan has no project room left (`code = project_limit_reached`). The limit refusal carries `details = { reason, resource, plan, limit, used, is_owner, owners[{ user_id, email }] }`, read live on every attempt (so a retry after an upgrade succeeds), and a message that names the owner for a non-owner. Existing projects are never touched.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

// BK-1900 — the read the Bunkai CLI uses to resolve `--project <slug>`.
const ProjectSummarySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().describe('URL slug, unique per workspace — the project route is `/projects/{slug}`.'),
    name: z.string(),
    created_at: z.string().datetime({ offset: true }),
  })
  .openapi('ProjectSummary');

const ProjectListSchema = z
  .object({
    projects: z.array(ProjectSummarySchema).describe('Ordered by name. Empty for a workspace with no projects AND for one the caller cannot reach.'),
  })
  .openapi('ProjectList');

const SlugParam = {
  name: 'slug',
  in: 'query' as const,
  required: false,
  schema: { type: 'string' as const, minLength: 1, maxLength: 100 },
  description: 'Optional exact project slug. When given, the list holds that one project or nothing.',
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/projects',
  tags: ['Projects'],
  summary: 'List a workspace\'s projects, optionally by exact slug',
  description: 'Bearer `atc:read` (or cookie session). Runs entirely under the caller\'s own RLS, so a foreign, nonexistent or soft-deleted workspace id returns the SAME `200 {"projects": []}` an empty workspace does — never an existence echo. A read that fails answers 500, never an empty list. The Bunkai CLI uses `?slug=` to resolve `--project <slug>`.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, SlugParam],
  responses: {
    200: { description: 'The workspace\'s projects (possibly empty).', content: { 'application/json': { schema: ProjectListSchema } } },
    400: { description: 'The workspace id in the path is not a UUID (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: '`slug` is present but blank or longer than 100 characters (`validation_failed`, `details.reason = slug_invalid`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    500: { description: 'The projects could not be read (`internal_error`). Deliberately not collapsed into an empty list.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { ProjectSchema };
