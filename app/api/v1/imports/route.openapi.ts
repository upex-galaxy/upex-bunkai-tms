import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const ImportJobErrorSchema = z
  .object({
    jira_key: z.string().optional(),
    code: z.string(),
    message: z.string().optional(),
  })
  .openapi('ImportJobError');

const ImportJobSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    project_id: z.string().uuid(),
    jql: z.string(),
    status: z.enum(['queued', 'running', 'completed', 'failed']),
    imported_count: z.number().int(),
    created_count: z.number().int(),
    updated_count: z.number().int(),
    skipped_count: z.number().int(),
    errors: z.array(ImportJobErrorSchema),
    started_at: z.string().datetime().nullable(),
    completed_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
  })
  .openapi('ImportJob');

const CreateBodySchema = z
  .object({
    project_id: z.string().uuid(),
    jql: z.string().describe('Jira JQL. Issues are imported into the project; components route to Modules by name (else Inbox).'),
  })
  .openapi('ImportCreateBody');

registry.registerPath({
  method: 'post',
  path: '/api/v1/imports',
  tags: ['Imports'],
  summary: 'Start an async Jira import',
  description: 'Member-only. Enqueues a one-way Jira import for the project and processes it in the background; idempotent on re-run. At most one active import per project (409). Returns immediately with the job id.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  request: { body: { required: true, content: { 'application/json': { schema: CreateBodySchema } } } },
  responses: {
    202: { description: 'Import enqueued.', content: { 'application/json': { schema: z.object({ import_job_id: z.string().uuid(), status: z.string() }) } } },
    400: { description: 'Malformed body.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'An import is already running for this project.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { ImportJobSchema };
