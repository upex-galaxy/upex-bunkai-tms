import type { DraftEvidence, DraftImage } from './evidence-draft';
import { describe, expect, it } from 'bun:test';
import { BUG_EVIDENCE_MESSAGES } from './constants';
import {
  buildEvidencePayload,
  idempotencyKeyFor,
  isEvidenceFull,
  planSelection,
  readyAttachmentIds,
  submitBlocker,
  usedBytes,
  usedSlots,
} from './evidence-draft';

// BK-594 - the drawer's evidence list: one budget of ten for links and images (AC-02, AC-03,
// AC-13, AC-20), 50 MiB of images (AC-05), the combined order (AC-01, AC-09) and the
// Idempotency-Key rule of a retried filing (AC-18).

const MIB = 1024 * 1024;

function link(n: number): DraftEvidence {
  return { kind: 'link', key: `l${n}`, url: `https://example.com/${n}` };
}

function image(n: number, status: DraftImage['status'] = 'ready', size = MIB): DraftImage {
  return { kind: 'image', key: `i${n}`, name: `${n}.png`, size, status, attachmentId: status === 'ready' ? `att-${n}` : null, error: status === 'failed' ? 'boom' : null };
}

describe('usedSlots / isEvidenceFull', () => {
  it('counts links and images together, uploads in flight included, failed images excluded', () => {
    const items = [link(1), image(2), image(3, 'uploading'), image(4, 'failed')];
    expect(usedSlots(items)).toBe(3);
    expect(isEvidenceFull(items)).toBe(false);
  });

  it.each([
    ['10 links', Array.from({ length: 10 }, (_, i) => link(i))],
    ['10 images', Array.from({ length: 10 }, (_, i) => image(i))],
    ['5 + 5', [...Array.from({ length: 5 }, (_, i) => link(i)), ...Array.from({ length: 5 }, (_, i) => image(i))]],
    ['9 images then a link', [...Array.from({ length: 9 }, (_, i) => image(i)), link(9)]],
    ['9 links then an image', [...Array.from({ length: 9 }, (_, i) => link(i)), image(9)]],
    ['7 held + 3 in flight', [...Array.from({ length: 7 }, (_, i) => link(i)), image(7, 'uploading'), image(8, 'uploading'), image(9, 'uploading')]],
  ])('every split reaches 10 / 10 and is full: %s', (_label, items) => {
    expect(usedSlots(items)).toBe(10);
    expect(isEvidenceFull(items)).toBe(true);
  });

  it('weighs links at 0 bytes and failed images not at all', () => {
    expect(usedBytes([link(1), image(2, 'ready', 3 * MIB), image(3, 'uploading', 2 * MIB), image(4, 'failed', 9 * MIB)])).toBe(5 * MIB);
  });
});

describe('planSelection', () => {
  it('accepts in selection order up to the free slots and refuses the rest by name (AC-13)', () => {
    const held = [...Array.from({ length: 4 }, (_, i) => link(i)), ...Array.from({ length: 4 }, (_, i) => image(i))];
    const files = ['a', 'b', 'c', 'd'].map(name => ({ name, size: MIB }));
    const plan = planSelection(held, files);
    expect(plan.accepted.map(f => f.name)).toEqual(['a', 'b']);
    expect(plan.refused).toEqual([
      { file: files[2], message: BUG_EVIDENCE_MESSAGES.count },
      { file: files[3], message: BUG_EVIDENCE_MESSAGES.count },
    ]);
  });

  it('refuses the eleventh whatever its kind and leaves the ten untouched (AC-03)', () => {
    const held = [...Array.from({ length: 4 }, (_, i) => link(i)), ...Array.from({ length: 6 }, (_, i) => image(i))];
    const before = structuredClone(held);
    const plan = planSelection(held, [{ name: 'eleventh.png', size: 10 }]);
    expect(plan.accepted).toHaveLength(0);
    expect(plan.refused[0]?.message).toBe(BUG_EVIDENCE_MESSAGES.count);
    expect(held).toEqual(before);
  });

  it('counts reserved in-flight slots, so the eleventh cannot start during a race (AC-20)', () => {
    const held = [...Array.from({ length: 7 }, (_, i) => link(i)), image(7, 'uploading'), image(8, 'uploading'), image(9, 'uploading')];
    expect(planSelection(held, [{ size: 1 }]).accepted).toHaveLength(0);
  });

  it('accepts exactly 50 MiB in total and refuses one byte more (AC-05)', () => {
    const held = [image(1, 'ready', 10 * MIB), image(2, 'ready', 10 * MIB), image(3, 'ready', 10 * MIB), image(4, 'ready', 10 * MIB), image(5, 'ready', 9 * MIB)];
    expect(planSelection(held, [{ size: MIB }]).accepted).toHaveLength(1);
    const plan = planSelection(held, [{ size: MIB + 1 }]);
    expect(plan.accepted).toHaveLength(0);
    expect(plan.refused[0]?.message).toBe(BUG_EVIDENCE_MESSAGES.bytes);
  });

  it('frees the slot of a failed image', () => {
    const held = [...Array.from({ length: 9 }, (_, i) => link(i)), image(9, 'failed')];
    expect(planSelection(held, [{ size: 1 }]).accepted).toHaveLength(1);
  });
});

describe('submitBlocker', () => {
  it('holds filing while an upload is in flight, then while a failed image is listed', () => {
    expect(submitBlocker([link(1), image(2, 'uploading'), image(3, 'failed')])).toBe('uploading');
    expect(submitBlocker([link(1), image(3, 'failed')])).toBe('failed');
    expect(submitBlocker([link(1), image(2)])).toBeNull();
    expect(submitBlocker([])).toBeNull();
  });
});

describe('buildEvidencePayload', () => {
  it('places each image at its position in the combined list, links filling the rest in order (AC-01, AC-09)', () => {
    const payload = buildEvidencePayload([image(1), link(2), image(3), link(4), link(5)]);
    expect(payload).toEqual({
      evidence_urls: ['https://example.com/2', 'https://example.com/4', 'https://example.com/5'],
      evidence_attachment_ids: ['att-1', 'att-3'],
      evidence_order: [0, 2],
    });
  });

  it('is links only, unchanged, when no image was attached (AC-08)', () => {
    expect(buildEvidencePayload([link(1), link(2)])).toEqual({
      evidence_urls: ['https://example.com/1', 'https://example.com/2'],
      evidence_attachment_ids: [],
      evidence_order: [],
    });
  });

  it('is empty for a defect filed with no evidence (AC-10)', () => {
    expect(buildEvidencePayload([])).toEqual({ evidence_urls: [], evidence_attachment_ids: [], evidence_order: [] });
  });

  it('allows the same image twice as two items (two uploads)', () => {
    const twice = [{ ...image(1), attachmentId: 'a' }, { ...image(1), key: 'i1b', attachmentId: 'b' }];
    expect(buildEvidencePayload(twice).evidence_attachment_ids).toEqual(['a', 'b']);
  });
});

describe('readyAttachmentIds', () => {
  it('lists only the uploads that landed', () => {
    expect(readyAttachmentIds([link(1), image(2), image(3, 'uploading'), image(4, 'failed')])).toEqual(['att-2']);
  });
});

describe('idempotencyKeyFor (AC-18)', () => {
  let n = 0;
  const mint = () => `key-${++n}`;

  it('reuses the key for a retry of the same payload (timeout, network error, double click)', () => {
    const first = idempotencyKeyFor(null, '{"t":1}', mint);
    const retry = idempotencyKeyFor(first, '{"t":1}', mint);
    expect(retry.key).toBe(first.key);
  });

  it('mints a new key once the payload changed', () => {
    const first = idempotencyKeyFor(null, '{"t":1}', mint);
    expect(idempotencyKeyFor(first, '{"t":2}', mint).key).not.toBe(first.key);
  });
});
