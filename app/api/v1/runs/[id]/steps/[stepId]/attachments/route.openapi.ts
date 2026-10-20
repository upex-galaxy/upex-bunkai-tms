import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-593 - run step evidence attachments. Init (this file), commit, remove, list and the
// content redirect are one feature: the shared schemas are exported from here.

const IdParam = {
  name: 'id',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const StepIdParam = {
  name: 'stepId',
  in: 'path' as const,
  required: true,
  schema: { type: 'string' as const, format: 'uuid' as const },
};

const IdempotencyKeyParam = {
  name: 'Idempotency-Key',
  in: 'header' as const,
  required: true,
  schema: { type: 'string' as const, pattern: '^[\\w-]{8,128}$' },
  description:
    'Required. 8-128 chars, [a-zA-Z0-9_-]. A retry with the same key and payload returns the stored answer and creates no second attachment; the same key with a different payload returns 409 `conflict`. The same image attached twice on purpose uses two different keys.',
};

export const RunStepAttachmentSchema = registry.register(
  'RunStepAttachment',
  z
    .object({
      id: z.string().uuid(),
      run_id: z.string().uuid(),
      run_step_id: z.string().uuid(),
      filename: z.string().describe('The name the uploader gave the file. Display only: never used to decide the type or build a path.'),
      content_type: z.enum(['image/png', 'image/jpeg', 'image/webp']),
      byte_size: z.number().int().describe('Declared size while `pending`; the size measured in Storage once `committed`.'),
      status: z.enum(['pending', 'committed']).describe('Only `committed` attachments are visible to anyone else, and only they are listed.'),
      created_by: z.string().uuid().nullable(),
      created_at: z.string(),
      committed_at: z.string().nullable(),
      expires_at: z.string().nullable().describe('End of the upload window of a `pending` attachment; null once committed.'),
    })
    .openapi({ description: 'Metadata of one image attached to a run step. Never carries a storage path or a URL.' }),
);

const InitBodySchema = z
  .object({
    filename: z.string().min(1).max(255).describe('Display name, 1-255 characters after trimming.'),
    content_type: z.enum(['image/png', 'image/jpeg', 'image/webp']).describe('Declared type. The bytes are checked against it at commit: the content decides, never the name.'),
    byte_size: z.number().int().min(1).max(10485760).describe('Size in bytes, 1 to 10485760 (10 MiB), inclusive.'),
  })
  .openapi('RunStepAttachmentInitBody');

const UploadTargetSchema = z
  .object({
    method: z.literal('PUT'),
    url: z.string().describe('Storage signed upload URL for this attachment only. Valid for 2 hours. Treat it as a secret.'),
    headers: z.record(z.string(), z.string()).describe('Send exactly these headers with the PUT. The body is the raw file bytes.'),
    expires_at: z.string(),
  })
  .openapi('RunStepAttachmentUploadTarget');

registry.registerPath({
  method: 'post',
  path: '/api/v1/runs/{id}/steps/{stepId}/attachments',
  tags: ['Runs'],
  summary: 'Start an evidence upload for a run step',
  description: 'Bearer `run:execute` (or cookie session); member+ write access; the Run must be `running`. Step 1 of 3: init -> PUT the raw bytes to `upload.url` with `upload.headers` -> `POST .../attachments/{attachmentId}/commit`. Limits (inclusive): PNG, JPEG or WebP only; 10 MiB per file; 10 images and 50 MiB per step; 250 MiB per Run. The attachment stays `pending` and invisible until commit; an upload that is never committed is discarded by the sweep after 3 hours. A step of any status accepts evidence; attaching never changes the step outcome.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [IdParam, StepIdParam, IdempotencyKeyParam],
  request: { body: { required: true, content: { 'application/json': { schema: InitBodySchema } } } },
  responses: {
    201: { description: 'Pending attachment created. PUT the bytes to `upload`, then commit.', content: { 'application/json': { schema: z.object({ attachment: RunStepAttachmentSchema, upload: UploadTargetSchema }) } } },
    400: { description: 'Malformed ids, malformed JSON, or missing/invalid Idempotency-Key (`bad_request`, `idempotency_key_required`, `idempotency_key_invalid`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing run:execute scope, or a viewer (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Run step not found: missing, of another Run, or in a workspace the caller is not a member of (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The Run is already closed (`conflict`, reason `run_not_open`), or the Idempotency-Key was reused with a different payload / is still in flight.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    413: { description: 'The file is larger than 10 MiB (`file_too_large`). Copy: "Images must be 10 MiB or smaller."', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    415: { description: 'Not PNG, JPEG or WebP (`unsupported_media_type`). Copy: "Only PNG, JPEG or WebP images are accepted."', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Empty file or invalid name (`validation_failed`, reasons `empty_file`, `invalid_filename`), or a quota is full (`attachment_limit_exceeded`, reasons `step_count`, `step_bytes`, `run_bytes`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    503: { description: 'File storage is temporarily unavailable (`storage_unavailable`). Safe to retry with the same Idempotency-Key.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
