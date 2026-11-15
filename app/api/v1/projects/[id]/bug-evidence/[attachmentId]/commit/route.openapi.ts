import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { BugEvidenceUploadSchema } from '../../route.openapi';

// BK-594 - finish one defect evidence upload.

registry.registerPath({
  method: 'post',
  path: '/api/v1/projects/{id}/bug-evidence/{attachmentId}/commit',
  tags: ['Bugs'],
  summary: 'Finish an image upload for a defect being filed',
  description: 'Bearer `atc:write` (or cookie session); the uploader only. Reads what actually arrived in Storage: the size from the object metadata, the type from its first 64 KiB. A file that is not the declared, still PNG, JPEG or WebP image is refused and discarded. Idempotent: an already committed upload answers with the same body. The upload stays invisible until a filing claims it.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Project id.' },
    { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
  ],
  responses: {
    200: { description: 'Committed.', content: { 'application/json': { schema: z.object({ attachment: BugEvidenceUploadSchema }) } } },
    400: { description: 'Malformed ids (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or no longer a writer (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Upload not found under this Project, or not the caller\'s (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The bytes have not arrived yet (`conflict`, reason `upload_missing`), or the 3 hour window lapsed (reason `pending_expired`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    413: { description: 'What arrived is larger than 10 MiB (`file_too_large`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'What arrived is empty, not the declared type, or animated (`validation_failed`, reasons `empty_file`, `content_mismatch`, `animated_image`), or the draft is full (`attachment_limit_exceeded`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    503: { description: 'File storage is temporarily unavailable (`storage_unavailable`). Safe to retry.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
