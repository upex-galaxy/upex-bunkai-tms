import { describe, expect, it } from 'bun:test';
import {
  EVIDENCE_FILE_MAX_BYTES,
  EVIDENCE_MESSAGES,
  validateEvidenceInit,
  validateStoredEvidence,
} from './evidence-validation';

// BK-593 - the evidence policy. Limits are inclusive: exactly 10 MiB passes, 10 MiB plus one
// byte is refused; zero bytes is refused; the type is decided by content.

const PNG = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0x49, 0x44, 0x41, 0x54, 1, 2, 3, 0, 0, 0, 0]);
const JPEG = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0]);

describe('validateEvidenceInit', () => {
  const base = { filename: 'screen.png', contentType: 'image/png', byteSize: 1024 };

  it('accepts the three image types and trims the filename', () => {
    for (const contentType of ['image/png', 'image/jpeg', 'image/webp']) {
      const result = validateEvidenceInit({ ...base, contentType, filename: '  shot.img  ' });
      expect(result).toMatchObject({ ok: true, value: { filename: 'shot.img', contentType, byteSize: 1024 } });
    }
  });

  it('accepts exactly 10 MiB and refuses 10 MiB plus one byte', () => {
    expect(validateEvidenceInit({ ...base, byteSize: EVIDENCE_FILE_MAX_BYTES }).ok).toBe(true);
    const over = validateEvidenceInit({ ...base, byteSize: EVIDENCE_FILE_MAX_BYTES + 1 });
    expect(over).toMatchObject({ ok: false, refusal: 'too_large', message: 'Images must be 10 MiB or smaller.' });
  });

  it('refuses zero bytes as an empty file', () => {
    expect(validateEvidenceInit({ ...base, byteSize: 0 })).toMatchObject({
      ok: false,
      refusal: 'empty',
      message: 'That file is empty or is not a valid PNG, JPEG or WebP image.',
    });
  });

  it('refuses other types with the frozen copy, whatever the extension says', () => {
    for (const contentType of ['image/gif', 'image/svg+xml', 'application/pdf', 'text/plain', '', 'IMAGE/PNG ']) {
      expect(validateEvidenceInit({ ...base, contentType })).toMatchObject({
        ok: false,
        refusal: 'unsupported_type',
        message: 'Only PNG, JPEG or WebP images are accepted.',
      });
    }
    // the extension is irrelevant to the decision
    expect(validateEvidenceInit({ ...base, filename: 'log.txt', contentType: 'image/png' }).ok).toBe(true);
    expect(validateEvidenceInit({ ...base, filename: 'shot.png', contentType: 'text/plain' }).ok).toBe(false);
  });

  it('refuses a blank or oversized filename and non-integer sizes', () => {
    expect(validateEvidenceInit({ ...base, filename: '   ' })).toMatchObject({ ok: false, refusal: 'invalid_filename' });
    expect(validateEvidenceInit({ ...base, filename: 'a'.repeat(256) })).toMatchObject({ ok: false, refusal: 'invalid_filename' });
    expect(validateEvidenceInit({ ...base, filename: 'a'.repeat(255) }).ok).toBe(true);
    expect(validateEvidenceInit({ ...base, byteSize: 1.5 })).toMatchObject({ ok: false, refusal: 'empty' });
    expect(validateEvidenceInit({ ...base, byteSize: -1 })).toMatchObject({ ok: false, refusal: 'empty' });
  });

  it('reports the type before the size when both are wrong', () => {
    expect(validateEvidenceInit({ ...base, contentType: 'image/gif', byteSize: EVIDENCE_FILE_MAX_BYTES + 1 })).toMatchObject({ refusal: 'unsupported_type' });
  });
});

describe('validateStoredEvidence', () => {
  it('accepts an object whose bytes match the declared type', () => {
    expect(validateStoredEvidence({ declaredType: 'image/png', actualSize: 500, head: PNG })).toEqual({ ok: true, value: { contentType: 'image/png', byteSize: 500 } });
    expect(validateStoredEvidence({ declaredType: 'image/jpeg', actualSize: EVIDENCE_FILE_MAX_BYTES, head: JPEG }).ok).toBe(true);
  });

  it('refuses an empty object and one above the limit by size, before looking at bytes', () => {
    expect(validateStoredEvidence({ declaredType: 'image/png', actualSize: 0, head: new Uint8Array(0) })).toMatchObject({ ok: false, refusal: 'empty' });
    expect(validateStoredEvidence({ declaredType: 'image/png', actualSize: EVIDENCE_FILE_MAX_BYTES + 1, head: PNG })).toMatchObject({ ok: false, refusal: 'too_large' });
  });

  it('refuses bytes that are not a real image of an accepted type', () => {
    expect(validateStoredEvidence({ declaredType: 'image/png', actualSize: 10, head: GIF })).toMatchObject({
      ok: false,
      refusal: 'invalid_image',
      message: 'That file is empty or is not a valid PNG, JPEG or WebP image.',
    });
    expect(validateStoredEvidence({ declaredType: 'image/png', actualSize: 10, head: Uint8Array.from([1, 2, 3]) })).toMatchObject({ refusal: 'invalid_image' });
  });

  it('refuses a declared type that differs from the sniffed type', () => {
    expect(validateStoredEvidence({ declaredType: 'image/jpeg', actualSize: 10, head: PNG })).toMatchObject({ ok: false, refusal: 'type_mismatch' });
    expect(validateStoredEvidence({ declaredType: 'image/webp', actualSize: 10, head: JPEG })).toMatchObject({ ok: false, refusal: 'type_mismatch' });
  });

  it('refuses animated images', () => {
    const apng = Uint8Array.from([...PNG.slice(0, 33), 0, 0, 0, 8, 0x61, 0x63, 0x54, 0x4C, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(validateStoredEvidence({ declaredType: 'image/png', actualSize: 100, head: apng })).toMatchObject({
      ok: false,
      refusal: 'animated',
      message: EVIDENCE_MESSAGES.animated,
    });
  });
});
