import { ErrorEnvelopeSchema, registry } from '@lib/openapi/registry';

// BK-594 - open one image filed as defect evidence (redirect to a short-lived signed URL).

registry.registerPath({
  method: 'get',
  path: '/api/v1/bugs/{id}/evidence/{attachmentId}/content',
  tags: ['Bugs'],
  summary: 'Open an image filed as defect evidence',
  description: 'Bearer `atc:read` (or cookie session); any member of the owning Workspace, viewers included (access is Workspace-level). Answers 302 with a `Location` that is a signed URL valid for 60 seconds, `Cache-Control: private, no-store`. There is no anonymous read path and a stored reference alone is never enough. Do not store or log the `Location`. Missing, foreign-Workspace, never-filed and soft-deleted-Workspace evidence all answer the same 404.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Bug id.' },
    { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
  ],
  responses: {
    302: { description: 'Redirect to the signed URL of the image (60 seconds).' },
    400: { description: 'Malformed ids (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:read scope (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Evidence not found (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    503: { description: 'File storage is temporarily unavailable (`storage_unavailable`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
