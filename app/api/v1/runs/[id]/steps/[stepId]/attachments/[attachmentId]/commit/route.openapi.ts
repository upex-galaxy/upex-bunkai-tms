import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';
import { RunStepAttachmentSchema } from '../../route.openapi';

// BK-593 - step 3 of 3 of an evidence upload.

registry.registerPath({
  method: 'post',
  path: '/api/v1/runs/{id}/steps/{stepId}/attachments/{attachmentId}/commit',
  tags: ['Runs'],
  summary: 'Commit an evidence upload',
  description: 'Bearer `run:execute` (or cookie session); only the person who started the upload. Reads what actually arrived in Storage: the size from the object metadata and the type from its first 64 KiB. The bytes must be a real, still PNG, JPEG or WebP image of the declared type, within the limits; otherwise the pending attachment and its object are discarded and the request is refused. On success the attachment becomes visible to every workspace member. Nothing commits after the Run closed (the first terminal outcome wins). Always safe to retry: an already committed attachment answers 200 with the same body.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    { name: 'stepId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    { name: 'attachmentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
  ],
  responses: {
    200: { description: 'Committed (or already committed).', content: { 'application/json': { schema: z.object({ attachment: RunStepAttachmentSchema }) } } },
    400: { description: 'Malformed ids (`bad_request`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing run:execute scope, or no longer a member with write access (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Attachment not found, or not yours (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The Run is already closed (`conflict`, reason `run_not_open`), the upload window lapsed (reason `pending_expired`), or the file was never uploaded (reason `upload_missing`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    413: { description: 'The uploaded object is larger than 10 MiB (`file_too_large`). The attachment is discarded.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'The bytes are not a valid image of the declared type (`validation_failed`, reasons `content_mismatch`, `empty_file`, `animated_image`; the attachment is discarded), or a quota is full (`attachment_limit_exceeded`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    503: { description: 'File storage is temporarily unavailable (`storage_unavailable`). Retry.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
