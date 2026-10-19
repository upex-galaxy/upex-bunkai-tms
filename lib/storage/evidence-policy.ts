// BK-593 - run step evidence policy: one place for the limits, the accepted types and the
// frozen copy, shared by the routes, the sweep and the runner UI. Framework-agnostic: no
// React, no Next, no Supabase import, so the browser bundle can use it.
//
// Decided by the AI Product Owner and AI Tech Lead on BK-593 (Jira, 2026-10-19). Every limit
// is INCLUSIVE: a file of exactly 10 MiB is accepted, 10 MiB plus one byte is refused.

export const EVIDENCE_BUCKET = 'run-evidence';

export const EVIDENCE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type EvidenceMimeType = (typeof EVIDENCE_MIME_TYPES)[number];

const MIB = 1024 * 1024;
export const EVIDENCE_FILE_MAX_BYTES = 10 * MIB;
export const EVIDENCE_STEP_MAX_BYTES = 50 * MIB;
export const EVIDENCE_RUN_MAX_BYTES = 250 * MIB;
export const EVIDENCE_STEP_MAX_COUNT = 10;
export const EVIDENCE_FILENAME_MAX = 255;

// How much of an uploaded object is read to decide its real type.
export const EVIDENCE_SNIFF_BYTES = 64 * 1024;
// Lifetime of the signed URL a content request is redirected to.
export const EVIDENCE_READ_URL_SECONDS = 60;

export type EvidenceRefusal
  = | 'unsupported_type'
    | 'too_large'
    | 'empty'
    | 'invalid_image'
    | 'type_mismatch'
    | 'animated'
    | 'invalid_filename';

// Frozen refusal copy (BK-593 AI Product Owner decision, Q3).
export const EVIDENCE_MESSAGES = {
  unsupported_type: 'Only PNG, JPEG or WebP images are accepted.',
  too_large: 'Images must be 10 MiB or smaller.',
  empty: 'That file is empty or is not a valid PNG, JPEG or WebP image.',
  invalid_image: 'That file is empty or is not a valid PNG, JPEG or WebP image.',
  type_mismatch: 'That file is empty or is not a valid PNG, JPEG or WebP image.',
  animated: 'Animated images are not supported. Attach a still PNG, JPEG or WebP image.',
  invalid_filename: 'The file name must be between 1 and 255 characters.',
  step_quota: 'This step already holds the maximum evidence (10 images or 50 MiB).',
  run_quota: 'This Run already holds the maximum evidence (250 MiB).',
} as const;

// Route-level answer per refusal: HTTP status, envelope code and the machine reason.
export const EVIDENCE_REFUSAL_HTTP: Record<EvidenceRefusal, { status: 413 | 415 | 422, code: 'file_too_large' | 'unsupported_media_type' | 'validation_failed', reason: string }> = {
  unsupported_type: { status: 415, code: 'unsupported_media_type', reason: 'unsupported_media_type' },
  too_large: { status: 413, code: 'file_too_large', reason: 'file_too_large' },
  empty: { status: 422, code: 'validation_failed', reason: 'empty_file' },
  invalid_image: { status: 422, code: 'validation_failed', reason: 'content_mismatch' },
  type_mismatch: { status: 422, code: 'validation_failed', reason: 'content_mismatch' },
  animated: { status: 422, code: 'validation_failed', reason: 'animated_image' },
  invalid_filename: { status: 422, code: 'validation_failed', reason: 'invalid_filename' },
};

export function isEvidenceMimeType(value: string): value is EvidenceMimeType {
  return (EVIDENCE_MIME_TYPES as readonly string[]).includes(value);
}
