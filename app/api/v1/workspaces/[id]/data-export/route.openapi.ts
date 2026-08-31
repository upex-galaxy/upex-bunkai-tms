import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

const WorkspaceExportSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(['queued', 'running', 'completed', 'failed']),
    archive_bytes: z.number().int().nullable(),
    error_message: z.string().nullable(),
    started_at: z.string().datetime().nullable(),
    completed_at: z.string().datetime().nullable(),
    expires_at: z.string().datetime().nullable(),
    created_at: z.string().datetime(),
  })
  .openapi('WorkspaceExport');

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'post',
  path: '/api/v1/workspaces/{id}/data-export',
  tags: ['Workspaces'],
  summary: 'Request an export of this workspace\'s data',
  description: 'Owner-only, cookie session only (a Bearer PAT is rejected regardless of scope). Enqueues an async export and processes it in the background. At most one active export per workspace (409). Returns immediately with the job id.',
  security: [{ cookieAuth: [] }],
  parameters: [IdParam],
  responses: {
    202: { description: 'Export enqueued.', content: { 'application/json': { schema: z.object({ export_job_id: z.string().uuid(), status: z.string() }) } } },
    400: { description: 'Malformed workspace id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Not the workspace Owner, or a Bearer PAT was used.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'An export is already being prepared for this workspace.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/data-export',
  tags: ['Workspaces'],
  summary: 'Poll the latest export for this workspace',
  description: 'Owner-only, cookie session only. Returns the latest export request, or null if none was ever requested. The client derives "expired" by comparing expires_at to now.',
  security: [{ cookieAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'Latest export (or null).', content: { 'application/json': { schema: z.object({ export: WorkspaceExportSchema.nullable() }) } } },
    400: { description: 'Malformed workspace id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Not the workspace Owner, or a Bearer PAT was used.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});

export { WorkspaceExportSchema };
