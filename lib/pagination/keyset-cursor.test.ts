import { decodeKeysetCursor, encodeKeysetCursor } from '@lib/pagination/keyset-cursor';
import { describe, expect, test } from 'bun:test';

// BK-49 — the generic (timestamp, id) base64url cursor codec extracted from
// `lib/runs/history-validation.ts` (Decision 4). Same test cases as the Runs
// cursor's own suite, ported field-neutral: this module knows nothing about
// what the timestamp measures.

const VALID_TIMESTAMP = '2026-07-29T11:52:00+00:00';
const VALID_ID = '11111111-1111-4111-8111-111111111111';
const VALID_CURSOR = encodeKeysetCursor({ timestamp: VALID_TIMESTAMP, id: VALID_ID });

describe('keyset cursor codec', () => {
  test('round-trips a cursor', () => {
    const decoded = decodeKeysetCursor(encodeKeysetCursor({ timestamp: VALID_TIMESTAMP, id: VALID_ID }));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.cursor.timestamp).toBe(VALID_TIMESTAMP);
      expect(decoded.cursor.id).toBe(VALID_ID);
    }
  });

  test('round-trips the Z-suffixed timestamp variant', () => {
    const timestamp = '2026-07-29T11:52:00.123Z';
    const decoded = decodeKeysetCursor(encodeKeysetCursor({ timestamp, id: VALID_ID }));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.cursor.timestamp).toBe(timestamp);
    }
  });

  test('encodes to an opaque token that does not expose the raw values', () => {
    expect(VALID_CURSOR).not.toContain(VALID_ID);
    expect(VALID_CURSOR).not.toContain(VALID_TIMESTAMP);
  });

  test('emits base64url — never a `+`, `/` or `=` to be mangled in a query string', () => {
    const padded = btoa(`${VALID_TIMESTAMP}|${VALID_ID}`);
    expect(padded).toContain('=');

    for (const timestamp of [VALID_TIMESTAMP, '2026-07-29T11:52:03.123456+00:00', '2026-07-29T11:52:00.5Z']) {
      const token = encodeKeysetCursor({ timestamp, id: VALID_ID });
      expect(token).not.toMatch(/[+/=]/);
      expect(new URLSearchParams(`cursor=${token}`).get('cursor')).toBe(token);
    }
  });

  test('round-trips a microsecond-precision timestamp through base64url', () => {
    const timestamp = '2026-07-29T11:52:03.123456+00:00';
    const decoded = decodeKeysetCursor(encodeKeysetCursor({ timestamp, id: VALID_ID }));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.cursor.timestamp).toBe(timestamp);
      expect(decoded.cursor.id).toBe(VALID_ID);
    }
  });

  test('still decodes a STANDARD-base64 cursor issued before the base64url switch', () => {
    const legacy = btoa(`${VALID_TIMESTAMP}|${VALID_ID}`);
    expect(legacy).not.toBe(encodeKeysetCursor({ timestamp: VALID_TIMESTAMP, id: VALID_ID }));

    const decoded = decodeKeysetCursor(legacy);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.cursor.timestamp).toBe(VALID_TIMESTAMP);
      expect(decoded.cursor.id).toBe(VALID_ID);
    }
  });

  test('re-pads correctly at every payload length residue', () => {
    const residues = new Set<number>();
    for (const timestamp of [
      '2026-07-29T11:52:00Z',
      '2026-07-29T11:52:00.123Z',
      '2026-07-29T11:52:00+00:00',
      '2026-07-29T11:52:00.123456+00:00',
    ]) {
      residues.add((`${timestamp}|${VALID_ID}`).length % 3);

      const decoded = decodeKeysetCursor(encodeKeysetCursor({ timestamp, id: VALID_ID }));
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.cursor.timestamp).toBe(timestamp);
      }
    }
    expect(residues.size).toBe(3);
  });

  test('rejects a truncated cursor', () => {
    expect(decodeKeysetCursor(VALID_CURSOR.slice(0, 20)).ok).toBe(false);
  });

  test('rejects a non-base64 cursor', () => {
    expect(decodeKeysetCursor('!!!not base64!!!').ok).toBe(false);
  });

  test('rejects an empty cursor', () => {
    expect(decodeKeysetCursor('').ok).toBe(false);
  });

  test('rejects a cursor with too few fields', () => {
    expect(decodeKeysetCursor(btoa(VALID_TIMESTAMP)).ok).toBe(false);
  });

  test('rejects a cursor with too many fields', () => {
    expect(decodeKeysetCursor(btoa(`${VALID_TIMESTAMP}|${VALID_ID}|extra`)).ok).toBe(false);
  });

  test('rejects a cursor whose id is not a uuid', () => {
    expect(decodeKeysetCursor(btoa(`${VALID_TIMESTAMP}|not-a-uuid`)).ok).toBe(false);
  });

  test('rejects a cursor whose timestamp is malformed', () => {
    expect(decodeKeysetCursor(btoa(`yesterday|${VALID_ID}`)).ok).toBe(false);
  });

  test('rejects a cursor whose timestamp is ISO-shaped but not a real instant', () => {
    expect(decodeKeysetCursor(btoa(`2026-13-45T99:99:99Z|${VALID_ID}`)).ok).toBe(false);
  });

  test('rejects a cursor with the halves swapped', () => {
    expect(decodeKeysetCursor(btoa(`${VALID_ID}|${VALID_TIMESTAMP}`)).ok).toBe(false);
  });
});
