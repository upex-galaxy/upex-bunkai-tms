import { BUG_EVIDENCE_MAX, BUG_EVIDENCE_MAX_BYTES, BUG_EVIDENCE_MESSAGES } from '@lib/bugs/constants';

// BK-594 - the evidence list of the Report-bug drawer: framework-agnostic, pure functions only
// (the uploads, the file picker and the drop target stay in the component). One ordered list
// holds pasted links and images together, in the order the tester added them (AI Product Owner
// decision P4). One budget of ten for both kinds, and 50 MiB of images (links weigh 0 bytes).
//
// An image is `uploading` until its commit answered, then `ready` (it carries the upload id the
// filing claims). A `failed` image stays in the list, marked, so the tester sees what did not
// land; it holds no slot and is never sent, and filing is blocked until it is removed (P3).

export interface DraftLink {
  kind: 'link'
  key: string
  url: string
}

export interface DraftImage {
  kind: 'image'
  key: string
  name: string
  size: number
  status: 'uploading' | 'ready' | 'failed'
  attachmentId: string | null
  error: string | null
}

export type DraftEvidence = DraftLink | DraftImage;

function holdsSlot(item: DraftEvidence): boolean {
  return item.kind === 'link' || item.status !== 'failed';
}

// The `N / 10` counter: links, images that landed and images still uploading. A slot an upload
// in flight reserves counts, so the eleventh cannot start while three are on their way (AC-20).
export function usedSlots(items: DraftEvidence[]): number {
  return items.filter(holdsSlot).length;
}

export function usedBytes(items: DraftEvidence[]): number {
  return items.reduce((sum, item) => (item.kind === 'image' && item.status !== 'failed' ? sum + item.size : sum), 0);
}

export function isEvidenceFull(items: DraftEvidence[]): boolean {
  return usedSlots(items) >= BUG_EVIDENCE_MAX;
}

export interface SelectionPlan<F> {
  accepted: F[]
  refused: Array<{ file: F, message: string }>
}

// Several files picked or dropped together (AC-13, AI Product Owner PO-1): accepted in
// selection order while a slot and the 50 MiB budget last, the rest refused by name. Nothing
// already held is touched. A file above 10 MiB is not judged here: the upload refuses it with
// the per-file copy, and its reserved slot is released.
export function planSelection<F extends { size: number }>(items: DraftEvidence[], files: F[]): SelectionPlan<F> {
  let slots = BUG_EVIDENCE_MAX - usedSlots(items);
  let bytes = usedBytes(items);
  const plan: SelectionPlan<F> = { accepted: [], refused: [] };
  for (const file of files) {
    if (slots <= 0) {
      plan.refused.push({ file, message: BUG_EVIDENCE_MESSAGES.count });
      continue;
    }
    if (bytes + file.size > BUG_EVIDENCE_MAX_BYTES) {
      plan.refused.push({ file, message: BUG_EVIDENCE_MESSAGES.bytes });
      continue;
    }
    plan.accepted.push(file);
    slots -= 1;
    bytes += file.size;
  }
  return plan;
}

export type SubmitBlocker = 'uploading' | 'failed' | null;

export function submitBlocker(items: DraftEvidence[]): SubmitBlocker {
  if (items.some(item => item.kind === 'image' && item.status === 'uploading')) {
    return 'uploading';
  }
  if (items.some(item => item.kind === 'image' && item.status === 'failed')) {
    return 'failed';
  }
  return null;
}

export const SUBMIT_BLOCKER_MESSAGES: Record<Exclude<SubmitBlocker, null>, string> = {
  uploading: 'Wait for the images to finish uploading before filing.',
  failed: 'An image did not upload. Remove it, or attach it again, before filing.',
};

export interface EvidencePayload {
  evidence_urls: string[]
  evidence_attachment_ids: string[]
  evidence_order: number[]
}

// The POST /bugs evidence fields, in the drawer's order: each image's position in the combined
// list, links in their own order filling the rest (the RPC's rule, AI Tech Lead T5). Only call
// it when `submitBlocker` is null.
export function buildEvidencePayload(items: DraftEvidence[]): EvidencePayload {
  const payload: EvidencePayload = { evidence_urls: [], evidence_attachment_ids: [], evidence_order: [] };
  let position = 0;
  for (const item of items) {
    if (item.kind === 'link') {
      payload.evidence_urls.push(item.url);
      position += 1;
    }
    else if (item.status === 'ready' && item.attachmentId) {
      payload.evidence_attachment_ids.push(item.attachmentId);
      payload.evidence_order.push(position);
      position += 1;
    }
  }
  return payload;
}

// The upload ids a closed drawer leaves behind, discarded on a best effort basis (the sweep
// removes any it misses after 3 hours).
export function readyAttachmentIds(items: DraftEvidence[]): string[] {
  return items.flatMap(item => (item.kind === 'image' && item.status === 'ready' && item.attachmentId ? [item.attachmentId] : []));
}

// One Idempotency-Key per payload (AC-18): a retry of the same filing after a timeout, a
// network error or a 5xx reuses the key, so the server replays the first answer instead of
// filing twice. A changed payload is a new request and gets a new key.
export function idempotencyKeyFor(last: { key: string, payload: string } | null, payload: string, mint: () => string): { key: string, payload: string } {
  if (last && last.payload === payload) {
    return last;
  }
  return { key: mint(), payload };
}
