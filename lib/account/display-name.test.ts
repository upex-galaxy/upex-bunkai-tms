import { describe, expect, it } from 'bun:test';
import {
  countCodePoints,
  DISPLAY_NAME_COPY,
  DISPLAY_NAME_MAX_RAW_LENGTH,
  parseDisplayName,
  readOwnDisplayName,
  readProviderName,
  resolveAccountName,
  trimDisplayName,
} from './display-name';

// BK-1949 — the one validation rule the Settings form and the API route share
// (Tech Lead ruling D8), and the readers that pick a name out of the auth user.
// Special characters are built from code points so the source stays plain
// ASCII and the test names say which character is under test.
const cp = (...points: number[]) => String.fromCodePoint(...points);
const NBSP = cp(0x00A0);
const IDEOGRAPHIC_SPACE = cp(0x3000);
const ZERO_WIDTH_SPACE = cp(0x200B);
const BOM = cp(0xFEFF);
const RLO = cp(0x202E);
const LRI = cp(0x2066);
const LINE_SEPARATOR = cp(0x2028);
const GRINNING = cp(0x1F600);
// Man, ZWJ, woman, ZWJ, girl, ZWJ, boy: one family glyph, 7 code points.
const FAMILY = cp(0x1F468, 0x200D, 0x1F469, 0x200D, 0x1F467, 0x200D, 0x1F466);
const COMBINING_ACUTE = cp(0x0301);

function expectRefused(raw: unknown, message: string) {
  expect(parseDisplayName(raw)).toEqual({ ok: false, message });
}

function expectSaved(raw: unknown, value: string) {
  expect(parseDisplayName(raw)).toEqual({ ok: true, value });
}

describe('parseDisplayName — accepted names', () => {
  it('accepts an ordinary name as typed (AC 1.1)', () => {
    expectSaved('Elena Vargas', 'Elena Vargas');
  });

  it('trims outer spaces and keeps inner spacing and case (AC 2.6)', () => {
    expectSaved('  Elena   Vargas  ', 'Elena   Vargas');
  });

  it('trims outer NBSP, tabs, U+3000, zero-width space and BOM (PO3)', () => {
    expectSaved(`${NBSP}\t${IDEOGRAPHIC_SPACE}Elena${ZERO_WIDTH_SPACE}${BOM}\t`, 'Elena');
  });

  it('accepts 1, 79 and 80 code points (AC 2.3, 2.5)', () => {
    expectSaved('E', 'E');
    expectSaved('A'.repeat(79), 'A'.repeat(79));
    expectSaved('A'.repeat(80), 'A'.repeat(80));
  });

  it('trims before counting, so 80 characters plus outer spaces is accepted (AC 2.6)', () => {
    expectSaved(`   ${'A'.repeat(80)}   `, 'A'.repeat(80));
  });

  it('counts an emoji once: 80 emoji (160 UTF-16 units) are accepted (AC 2.3, E4)', () => {
    const name = GRINNING.repeat(80);
    expect(name.length).toBe(160);
    expectSaved(name, name);
  });

  it('counts a ZWJ family by its 7 code points and accepts it (E4)', () => {
    expect(countCodePoints(FAMILY)).toBe(7);
    expectSaved(`Elena ${FAMILY}`, `Elena ${FAMILY}`);
  });

  it('accepts 80 combining-mark code points (E4)', () => {
    const name = `e${COMBINING_ACUTE}`.repeat(40);
    expect(countCodePoints(name)).toBe(80);
    expectSaved(name, name);
  });

  it('accepts an ordinary right-to-left name (E9)', () => {
    const arabic = cp(0x0644, 0x064A, 0x0644, 0x0649);
    expectSaved(arabic, arabic);
  });

  it('keeps markup as literal text; rendering escapes it (AC 2.7)', () => {
    expectSaved('<b>Elena</b>', '<b>Elena</b>');
  });

  it('accepts a name that looks like an email or a URL (edge case 16)', () => {
    expectSaved('elena@acme.io', 'elena@acme.io');
    expectSaved('https://acme.io', 'https://acme.io');
  });
});

describe('parseDisplayName — refused names', () => {
  it('refuses an empty string (AC 2.1)', () => {
    expectRefused('', DISPLAY_NAME_COPY.empty);
  });

  it('refuses a name of only spaces (AC 2.2)', () => {
    expectRefused('     ', DISPLAY_NAME_COPY.empty);
  });

  it('refuses NBSP-only, U+3000-only and zero-width-only names as empty (E3)', () => {
    expectRefused(NBSP.repeat(3), DISPLAY_NAME_COPY.empty);
    expectRefused(IDEOGRAPHIC_SPACE, DISPLAY_NAME_COPY.empty);
    expectRefused(ZERO_WIDTH_SPACE.repeat(3), DISPLAY_NAME_COPY.empty);
    expectRefused('\t\t', DISPLAY_NAME_COPY.empty);
  });

  it('refuses 81 code points with the length message (AC 2.4)', () => {
    expectRefused('A'.repeat(81), DISPLAY_NAME_COPY.tooLong);
    expect(DISPLAY_NAME_COPY.tooLong).toContain('The name must be at most 80 characters');
  });

  it('refuses 81 emoji (AC 2.4, E4)', () => {
    expectRefused(GRINNING.repeat(81), DISPLAY_NAME_COPY.tooLong);
  });

  it('refuses a newline or a tab inside the name (E8)', () => {
    expectRefused('Elena\nVargas', DISPLAY_NAME_COPY.forbiddenCharacters);
    expectRefused('Elena\tVargas', DISPLAY_NAME_COPY.forbiddenCharacters);
    expectRefused(`Elena${LINE_SEPARATOR}Vargas`, DISPLAY_NAME_COPY.forbiddenCharacters);
  });

  it('refuses bidi override and isolate controls (E9)', () => {
    expectRefused(`Elena${RLO}sagraV`, DISPLAY_NAME_COPY.forbiddenCharacters);
    expectRefused(`${LRI}Elena`, DISPLAY_NAME_COPY.forbiddenCharacters);
  });

  it('refuses non-string values (E10)', () => {
    for (const raw of [null, undefined, 123, ['a'], {}, true]) {
      expectRefused(raw, DISPLAY_NAME_COPY.notText);
    }
  });

  it('states the empty message the AC names (PO5)', () => {
    expect(DISPLAY_NAME_COPY.empty).toContain('The display name cannot be empty');
  });
});

describe('parseDisplayName — hostile input size (BK-1949 review)', () => {
  it('accepts 80 characters padded with spaces up to the raw cap', () => {
    const padded = `${' '.repeat(460)}${'A'.repeat(80)}${' '.repeat(460)}`;
    expect(padded.length).toBe(DISPLAY_NAME_MAX_RAW_LENGTH);
    expectSaved(padded, 'A'.repeat(80));
  });

  it('refuses raw input longer than the cap with the length message, before trimming', () => {
    expectRefused(' '.repeat(DISPLAY_NAME_MAX_RAW_LENGTH + 1), DISPLAY_NAME_COPY.tooLong);
  });

  it('trims in linear time: a long inner whitespace run is cheap', () => {
    const hostile = `a${' '.repeat(200_000)}b`;
    const started = performance.now();
    expect(trimDisplayName(hostile)).toBe(hostile);
    // The anchored-regex version took about 2.5 s at 80k spaces.
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe('trimDisplayName', () => {
  it('leaves inner zero-width joiners alone, so emoji sequences survive', () => {
    expect(trimDisplayName(` ${FAMILY} `)).toBe(FAMILY);
  });
});

describe('name readers', () => {
  it('reads the own name from app_metadata.display_name', () => {
    expect(readOwnDisplayName({ display_name: 'Elena V.', provider: 'google' })).toBe('Elena V.');
  });

  it('treats a missing, blank or non-string own name as none', () => {
    expect(readOwnDisplayName(null)).toBeNull();
    expect(readOwnDisplayName({})).toBeNull();
    expect(readOwnDisplayName({ display_name: '   ' })).toBeNull();
    expect(readOwnDisplayName({ display_name: 42 })).toBeNull();
  });

  it('reads the Google name first, then the GitHub name', () => {
    expect(readProviderName({ full_name: 'Elena Vargas', name: 'evargas' })).toBe('Elena Vargas');
    expect(readProviderName({ name: 'Elena GH' })).toBe('Elena GH');
    expect(readProviderName({})).toBeNull();
  });

  it('settings name: the own name beats the provider name (AC 1.5, E16)', () => {
    expect(resolveAccountName({
      appMetadata: { display_name: 'Elena V.' },
      userMetadata: { full_name: 'Elena Vargas-Ruiz' },
    })).toBe('Elena V.');
  });

  it('settings name: falls back to the provider name with no own name (AC 1.4, 3.2)', () => {
    expect(resolveAccountName({ appMetadata: {}, userMetadata: { full_name: 'Elena Vargas' } })).toBe('Elena Vargas');
  });

  it('settings name: never guesses from the email, so a password account gets none (D6)', () => {
    expect(resolveAccountName({ appMetadata: { provider: 'email' }, userMetadata: {} })).toBeNull();
  });

  it('ignores a display_name written to user_metadata (browser-writable, ruling D1)', () => {
    expect(resolveAccountName({ appMetadata: {}, userMetadata: { display_name: 'Spoofed' } })).toBeNull();
  });
});
