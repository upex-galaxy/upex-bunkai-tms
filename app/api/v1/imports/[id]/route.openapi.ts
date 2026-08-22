import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { ImportJobSchema } from '../route.openapi';

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/imports/{id}',
  tags: ['Imports'],
  summary: 'Poll an import job',
  description: 'Bearer \`atc:read\` (or cookie session). Member-only. Returns the job status (queued | running | completed | failed) plus per-run counts and per-issue errors.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'Job.', content: { 'application/json': { schema: z.object({ import_job: ImportJobSchema }) } } },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope or not a member.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Not found.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
