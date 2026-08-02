import { decodeBugsCursor, encodeBugsCursor } from '@lib/bugs/list-cursor';
import { describe, expect, it } from 'bun:test';

// BK-41 — the bugs-local 3-field keyset-cursor codec (Decision 11). Mirrors
// `lib/pagination/keyset-cursor.ts`'s own test coverage style: round-trip a
// valid cursor, then prove every malformed shape collapses to `ok: false`
// (ATP-14's boundary — a malformed cursor is a 400, never a silent first page).

const VALID_ID = '11111111-1111-4111-8111-111111111111';
const VALID_CREATED_AT = '2026-07-29T11:52:00+00:00';

describe('encodeBugsCursor / decodeBugsCursor', () => {
  it('round-trips a valid cursor', () => {
    const encoded = encodeBugsCursor({ severity: 'P2', createdAt: VALID_CREATED_AT, id: VALID_ID });
    const decoded = decodeBugsCursor(encoded);
    expect(decoded).toEqual({ ok: true, cursor: { severity: 'P2', createdAt: VALID_CREATED_AT, id: VALID_ID } });
  });

  it('round-trips every severity value', () => {
    for (const severity of ['P1', 'P2', 'P3', 'P4'] as const) {
      const encoded = encodeBugsCursor({ severity, createdAt: VALID_CREATED_AT, id: VALID_ID });
      const decoded = decodeBugsCursor(encoded);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.cursor.severity).toBe(severity);
      }
    }
  });

  it('produces a URL-safe token (no +, /, or = characters)', () => {
    const encoded = encodeBugsCursor({ severity: 'P1', createdAt: VALID_CREATED_AT, id: VALID_ID });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('rejects a token that is not valid base64', () => {
    expect(decodeBugsCursor('!!!not-base64!!!')).toEqual({ ok: false });
  });

  it('rejects a cursor with the wrong number of parts (fewer than 3)', () => {
    const malformed = btoa(`P1|${VALID_CREATED_AT}`).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    expect(decodeBugsCursor(malformed)).toEqual({ ok: false });
  });

  it('rejects a cursor with the wrong number of parts (more than 3)', () => {
    const malformed = btoa(`P1|${VALID_CREATED_AT}|${VALID_ID}|extra`).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    expect(decodeBugsCursor(malformed)).toEqual({ ok: false });
  });

  it('rejects an unrecognized severity value', () => {
    const malformed = btoa(`P9|${VALID_CREATED_AT}|${VALID_ID}`).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    expect(decodeBugsCursor(malformed)).toEqual({ ok: false });
  });

  it('rejects an unparseable timestamp', () => {
    const malformed = btoa(`P1|not-a-date|${VALID_ID}`).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    expect(decodeBugsCursor(malformed)).toEqual({ ok: false });
  });

  it('rejects a non-UUID id', () => {
    const malformed = btoa(`P1|${VALID_CREATED_AT}|not-a-uuid`).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    expect(decodeBugsCursor(malformed)).toEqual({ ok: false });
  });

  it('accepts the standard base64 alphabet on input, not only base64url', () => {
    // Same bytes as encodeBugsCursor would produce, but padded/standard —
    // proves decode is lenient on the way in even though it only ever emits
    // base64url (mirrors lib/pagination/keyset-cursor.ts's own contract).
    const standard = btoa(`P3|${VALID_CREATED_AT}|${VALID_ID}`);
    const decoded = decodeBugsCursor(standard);
    expect(decoded).toEqual({ ok: true, cursor: { severity: 'P3', createdAt: VALID_CREATED_AT, id: VALID_ID } });
  });
});
