import { z } from 'zod';

// BK-593 - SHAPE validation of the init body only. The policy (accepted types, sizes, name
// length) lives in `@lib/storage/evidence-validation` because each refusal needs its own HTTP
// status (413 / 415 / 422), which a generic Zod error cannot carry.
export const AttachmentInitBodySchema = z.object({
  filename: z.string(),
  content_type: z.string(),
  byte_size: z.number(),
});

export type AttachmentInitBody = z.infer<typeof AttachmentInitBodySchema>;

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

// Resolved by segment NAME (not a fixed offset), like the mark route: the same extractor serves
// every route under .../runs/{id}/steps/{stepId}/attachments/{attachmentId}/...
export function extractAttachmentIds(pathname: string): { runId: string, stepId: string, attachmentId: string } {
  const segments = pathname.split('/').filter(Boolean);
  const after = (name: string): string => {
    const idx = segments.lastIndexOf(name);
    return idx >= 0 ? (segments[idx + 1] ?? '') : '';
  };
  return { runId: after('runs'), stepId: after('steps'), attachmentId: after('attachments') };
}
