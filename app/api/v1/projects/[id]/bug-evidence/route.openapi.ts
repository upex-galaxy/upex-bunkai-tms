import { ErrorEnvelopeSchema, registry, z } from '@lib/openapi/registry';

// BK-594 - defect evidence uploads. Init (this file), commit, discard and the content redirect
// are one feature: the shared schema is exported from here.

const IdempotencyKeyParam = {
  name: 'Idempotency-Key',
  in: 'header' as const,
  required: true,
  schema: { type: 'string' as const, pattern: '^[\\w-]{8,128}$' },
  description:
    'Required. 8-128 chars, [a-zA-Z0-9_-]. A retry with the same key and payload returns the stored answer and creates no second upload; the same key with a different payload returns 409 `conflict`. The same image attached twice on purpose uses two different keys.',
};

export const BugEvidenceUploadSchema = registry.register(
  'BugEvidenceUpload',
  z
    .object({
      id: z.string().uuid(),
      project_id: z.string().uuid(),
      draft_id: z.string().uuid().describe('The draft (one open filing form) this upload is counted against.'),
      bug_id: z.string().uuid().nullable().describe('Null until a filing claims the upload.'),
      position: z.number().int().nullable(),
      filename: z.string().describe('Display only: never used to decide the type or build a path.'),
      content_type: z.enum(['image/png', 'image/jpeg', 'image/webp']),
      byte_size: z.number().int().describe('Declared size while `pending`; the size measured in Storage once `committed`.'),
      status: z.enum(['pending', 'committed']),
      created_by: z.string().uuid().nullable(),
      created_at: z.string(),
      committed_at: z.string().nullable(),
      expires_at: z.string().nullable().describe('An upload that no filing claims by this time is discarded (3 hours after init).'),
    })
    .openapi({ description: 'One image uploaded for a defect that is being filed. Never carries a storage path or a URL, and nobody can read it until a filing claims it.' }),
);

const InitBodySchema = z
  .object({
    filename: z.string().min(1).max(255).describe('Display name, 1-255 characters after trimming.'),
    content_type: z.enum(['image/png', 'image/jpeg', 'image/webp']).describe('Declared type. The bytes are checked against it at commit: the content decides, never the name.'),
    byte_size: z.number().int().min(1).max(10485760).describe('Size in bytes, 1 to 10485760 (10 MiB), inclusive.'),
    draft_id: z.string().uuid().describe('A uuid the client keeps for one filing form. At most 10 uploads and 50 MiB are live per draft.'),
  })
  .openapi('BugEvidenceInitBody');

const UploadTargetSchema = z
  .object({
    method: z.literal('PUT'),
    url: z.string().describe('Storage signed upload URL for this upload only. Valid for 2 hours. Treat it as a secret.'),
    headers: z.record(z.string(), z.string()).describe('Send exactly these headers with the PUT. The body is the raw file bytes.'),
    expires_at: z.string(),
  })
  .openapi('BugEvidenceUploadTarget');

registry.registerPath({
  method: 'post',
  path: '/api/v1/projects/{id}/bug-evidence',
  tags: ['Bugs'],
  summary: 'Start an image upload for a defect being filed',
  description: 'Bearer `atc:write` (or cookie session); member+ write access in the Project\'s Workspace. Step 1 of 3: init -> PUT the raw bytes to `upload.url` with `upload.headers` -> `POST .../bug-evidence/{attachmentId}/commit`, then file the defect with `POST /api/v1/bugs` and `evidence_attachment_ids`. Limits (inclusive): PNG, JPEG or WebP only; 10 MiB per file; one budget of 10 items (pasted links and images together) and 50 MiB per defect. Nobody can read an upload until a filing claims it; an upload never claimed is discarded after 3 hours.',
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  parameters: [
    { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Project id.' },
    IdempotencyKeyParam,
  ],
  request: { body: { required: true, content: { 'application/json': { schema: InitBodySchema } } } },
  responses: {
    201: { description: 'Pending upload created. PUT the bytes to `upload`, then commit.', content: { 'application/json': { schema: z.object({ attachment: BugEvidenceUploadSchema, upload: UploadTargetSchema }) } } },
    400: { description: 'Malformed id, malformed JSON, or missing/invalid Idempotency-Key (`bad_request`, `idempotency_key_required`, `idempotency_key_invalid`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    401: { description: 'Not authenticated.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    403: { description: 'Missing atc:write scope, or a viewer (`forbidden`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    404: { description: 'Project not found, or in a Workspace the caller is not a member of (non-disclosing).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    409: { description: 'The Idempotency-Key was reused with a different payload or is still in flight (`conflict`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    413: { description: 'The file is larger than 10 MiB (`file_too_large`). Copy: "Images must be 10 MiB or smaller."', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    415: { description: 'Not PNG, JPEG or WebP (`unsupported_media_type`). Copy: "Only PNG, JPEG or WebP images are accepted."', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    422: { description: 'Empty file or invalid name (`validation_failed`, reasons `empty_file`, `invalid_filename`), or the draft is full (`attachment_limit_exceeded`, reasons `defect_count`, `defect_bytes`).', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
    503: { description: 'File storage is temporarily unavailable (`storage_unavailable`). Safe to retry with the same Idempotency-Key.', content: { 'application/json': { schema: ErrorEnvelopeSchema } } },
  },
});
