import type { EvidenceMimeType, EvidenceRefusal } from './evidence-policy';
import { EVIDENCE_FILE_MAX_BYTES, EVIDENCE_FILENAME_MAX, EVIDENCE_MESSAGES, isEvidenceMimeType } from './evidence-policy';
import { sniffImage } from './image-sniff';

// BK-593 - evidence validation, pure. Two checkpoints share one vocabulary of refusals:
//   * validateEvidenceInit: what the client DECLARES before any byte is sent (init route,
//     and the browser pre-check);
//   * validateStoredEvidence: what actually ARRIVED in Storage (commit route): real size from
//     Storage metadata, real type from the first 64 KiB.

export {
  EVIDENCE_FILE_MAX_BYTES,
  EVIDENCE_MESSAGES,
  EVIDENCE_MIME_TYPES,
  EVIDENCE_REFUSAL_HTTP,
  EVIDENCE_RUN_MAX_BYTES,
  EVIDENCE_STEP_MAX_BYTES,
  EVIDENCE_STEP_MAX_COUNT,
} from './evidence-policy';
export type { EvidenceMimeType, EvidenceRefusal } from './evidence-policy';

export interface EvidenceRefused {
  ok: false
  refusal: EvidenceRefusal
  message: string
}

export interface EvidenceInitInput {
  filename: string
  contentType: string
  byteSize: number
}

export interface EvidenceInitValue {
  filename: string
  contentType: EvidenceMimeType
  byteSize: number
}

function refuse(refusal: EvidenceRefusal): EvidenceRefused {
  return { ok: false, refusal, message: EVIDENCE_MESSAGES[refusal] };
}

// Order matters and is observable: filename shape, then type, then emptiness, then size.
// A wrong type reports the type even when the file is also too big.
export function validateEvidenceInit(input: EvidenceInitInput): { ok: true, value: EvidenceInitValue } | EvidenceRefused {
  const filename = input.filename.trim();
  if (filename.length < 1 || filename.length > EVIDENCE_FILENAME_MAX) {
    return refuse('invalid_filename');
  }
  if (!isEvidenceMimeType(input.contentType)) {
    return refuse('unsupported_type');
  }
  if (!Number.isInteger(input.byteSize) || input.byteSize < 1) {
    return refuse('empty');
  }
  if (input.byteSize > EVIDENCE_FILE_MAX_BYTES) {
    return refuse('too_large');
  }
  return { ok: true, value: { filename, contentType: input.contentType, byteSize: input.byteSize } };
}

export interface StoredEvidenceInput {
  declaredType: EvidenceMimeType
  // Size read from Storage metadata, not from what the client said.
  actualSize: number
  // The first bytes of the object (at most 64 KiB).
  head: Uint8Array
}

export function validateStoredEvidence(input: StoredEvidenceInput): { ok: true, value: { contentType: EvidenceMimeType, byteSize: number } } | EvidenceRefused {
  if (!Number.isInteger(input.actualSize) || input.actualSize < 1) {
    return refuse('empty');
  }
  if (input.actualSize > EVIDENCE_FILE_MAX_BYTES) {
    return refuse('too_large');
  }
  const sniffed = sniffImage(input.head);
  if (!sniffed) {
    return refuse('invalid_image');
  }
  if (sniffed.type !== input.declaredType) {
    return refuse('type_mismatch');
  }
  if (sniffed.animated) {
    return refuse('animated');
  }
  return { ok: true, value: { contentType: sniffed.type, byteSize: input.actualSize } };
}
