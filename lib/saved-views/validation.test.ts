import { describe, expect, test } from 'bun:test';
import { SAVED_VIEW_NAME_MAX } from './constants';
import { validateStateForKind } from './state';
import {
  SavedViewCreateBodySchema,
  SavedViewListQuerySchema,
  SavedViewNameSchema,
  SavedViewPatchBodySchema,
} from './validation';

// BK-443 — request-shape rules. The database re-enforces the name rules
// (migration 0093); these refuse early with the same numbers.

describe('SavedViewNameSchema', () => {
  test('trims surrounding whitespace, tabs and non-breaking spaces', () => {
    expect(SavedViewNameSchema.parse('  Critical bugs ')).toBe('Critical bugs');
  });

  test('keeps case and internal spacing exactly as typed', () => {
    expect(SavedViewNameSchema.parse('Checkout  BLOCKERS')).toBe('Checkout  BLOCKERS');
  });

  test('rejects an empty name and a whitespace-only name with reason name_length', () => {
    for (const input of ['', '   ', '\t']) {
      const result = SavedViewNameSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect((result.error.issues[0] as { params?: { reason?: string } }).params?.reason).toBe('name_length');
      }
    }
  });

  test('accepts exactly 80 characters and rejects 81', () => {
    expect(SavedViewNameSchema.safeParse('x'.repeat(SAVED_VIEW_NAME_MAX)).success).toBe(true);
    expect(SavedViewNameSchema.safeParse('x'.repeat(SAVED_VIEW_NAME_MAX + 1)).success).toBe(false);
  });

  test('counts code points, so 80 emoji pass and 81 fail (SQL char_length agrees)', () => {
    expect('😀'.repeat(80).length).toBe(160);
    expect(SavedViewNameSchema.safeParse('😀'.repeat(80)).success).toBe(true);
    expect(SavedViewNameSchema.safeParse('😀'.repeat(81)).success).toBe(false);
  });

  test('accepts Unicode names such as "🔴 P1s this sprint"', () => {
    expect(SavedViewNameSchema.parse('🔴 P1s this sprint')).toBe('🔴 P1s this sprint');
  });

  test('rejects control characters inside the name with reason name_invalid', () => {
    const result = SavedViewNameSchema.safeParse('two\nlines');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error.issues[0] as { params?: { reason?: string } }).params?.reason).toBe('name_invalid');
    }
  });

  test('NFC-normalises, so the NFC and NFD spellings of one name are the same name', () => {
    const nfc = 'caf\u00E9';
    const nfd = 'cafe\u0301';
    expect(nfc).not.toBe(nfd);
    expect(SavedViewNameSchema.parse(nfd)).toBe(nfc);
    expect(SavedViewNameSchema.parse(nfc)).toBe(nfc);
  });

  test('counts code points after NFC: 80 decomposed accents fit, 81 do not', () => {
    expect(SavedViewNameSchema.safeParse('e\u0301'.repeat(80)).success).toBe(true);
    expect(SavedViewNameSchema.safeParse('e\u0301'.repeat(81)).success).toBe(false);
  });

  test('rejects a non-string', () => {
    expect(SavedViewNameSchema.safeParse(42).success).toBe(false);
  });
});

describe('SavedViewCreateBodySchema', () => {
  const valid = { view_kind: 'bugs', name: ' Critical bugs ', state: { severity: 'P1' } };

  test('parses a valid body and trims the name', () => {
    expect(SavedViewCreateBodySchema.parse(valid)).toEqual({ view_kind: 'bugs', name: 'Critical bugs', state: { severity: 'P1' } });
  });

  test('rejects an unknown view_kind', () => {
    expect(SavedViewCreateBodySchema.safeParse({ ...valid, view_kind: 'dashboard' }).success).toBe(false);
  });

  test('rejects an unknown top-level field (strict)', () => {
    expect(SavedViewCreateBodySchema.safeParse({ ...valid, user_id: '00000000-0000-0000-0000-000000000000' }).success).toBe(false);
  });

  test('rejects a missing name, a missing state, and a non-text state value', () => {
    expect(SavedViewCreateBodySchema.safeParse({ view_kind: 'bugs', state: {} }).success).toBe(false);
    expect(SavedViewCreateBodySchema.safeParse({ view_kind: 'bugs', name: 'x' }).success).toBe(false);
    expect(SavedViewCreateBodySchema.safeParse({ ...valid, state: { severity: ['P1'] } }).success).toBe(false);
  });
});

describe('hostile state keys never reach a 500', () => {
  test('Zod drops an own __proto__ key and keeps the prototype intact', () => {
    const body = JSON.parse('{"view_kind":"bugs","name":"a","state":{"severity":"P1","__proto__":"x"}}');
    const parsed = SavedViewCreateBodySchema.parse(body);
    expect(parsed.state).toEqual({ severity: 'P1' });
    expect(Object.getPrototypeOf(parsed.state)).toBe(Object.prototype);
  });

  test('constructor passes the shape check and is refused by the surface rules as state_invalid', () => {
    const parsed = SavedViewCreateBodySchema.parse(JSON.parse('{"view_kind":"bugs","name":"a","state":{"constructor":"x"}}'));
    expect(validateStateForKind('bugs', parsed.state)).toEqual({ ok: false, reason: 'state_invalid' });
  });
});

describe('SavedViewPatchBodySchema', () => {
  test('accepts a rename only, a state only, and both', () => {
    expect(SavedViewPatchBodySchema.safeParse({ name: 'P1 bugs' }).success).toBe(true);
    expect(SavedViewPatchBodySchema.safeParse({ state: { severity: 'P2' } }).success).toBe(true);
    expect(SavedViewPatchBodySchema.safeParse({ name: 'P1 bugs', state: { severity: 'P2' } }).success).toBe(true);
  });

  test('rejects an empty body with reason body_empty', () => {
    const result = SavedViewPatchBodySchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error.issues[0] as { params?: { reason?: string } }).params?.reason).toBe('body_empty');
    }
  });

  test('refuses to change the surface, the owner or the project (strict)', () => {
    for (const field of ['view_kind', 'user_id', 'project_id']) {
      expect(SavedViewPatchBodySchema.safeParse({ name: 'x', [field]: 'bugs' }).success).toBe(false);
    }
  });
});

describe('SavedViewListQuerySchema', () => {
  test('requires a known view_kind', () => {
    expect(SavedViewListQuerySchema.safeParse({ view_kind: 'run_history' }).success).toBe(true);
    expect(SavedViewListQuerySchema.safeParse({}).success).toBe(false);
    expect(SavedViewListQuerySchema.safeParse({ view_kind: 'nope' }).success).toBe(false);
  });
});
