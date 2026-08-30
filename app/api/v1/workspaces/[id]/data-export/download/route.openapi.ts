import { ErrorEnvelopeSchema, registry } from '@lib/openapi/registry';

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

registry.registerPath({
  method: 'get',
  path: '/api/v1/workspaces/{id}/data-export/download',
  tags: ['Workspaces'],
  summary: 'Download the ready export archive',
  description: 'Owner-only, cookie session only. Streams the ZIP archive of the latest completed, unexpired export. Records an export.downloaded Activity Stream entry on every successful call.',
  security: [{ cookieAuth: [] }],
  parameters: [IdParam],
  responses: {
    200: { description: 'ZIP archive stream.', content: { 'application/zip': { schema: { type: 'string', format: 'binary' } } } },
    400: { description: 'Malformed workspace id.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not signed in.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Not the workspace Owner, or a Bearer PAT was used.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'No export requested yet, not ready, or the ready archive has expired.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
