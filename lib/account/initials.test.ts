import { emailInitials } from '@lib/account/initials';
import { describe, expect, test } from 'bun:test';

describe('emailInitials', () => {
  test('two dot-separated tokens -> first letter of each, uppercased', () => {
    expect(emailInitials('elena.ramirez@bunkai.io')).toBe('ER');
  });

  test('single-token local-part -> first two letters', () => {
    expect(emailInitials('elena@bunkai.io')).toBe('EL');
  });

  test('strips a +tag suffix before deriving initials', () => {
    expect(emailInitials('elena+qa@bunkai.io')).toBe('EL');
    expect(emailInitials('elena.ramirez+staging@bunkai.io')).toBe('ER');
  });

  test('one-character local-part -> single uppercase letter', () => {
    expect(emailInitials('e@x.io')).toBe('E');
  });

  test('hyphen and underscore separators tokenize too', () => {
    expect(emailInitials('john-doe@x.io')).toBe('JD');
    expect(emailInitials('john_doe@x.io')).toBe('JD');
  });

  test('numeric-only local-part falls back to raw chars (EC-1)', () => {
    expect(emailInitials('12345@x.io')).toBe('12');
  });

  test('mixed numeric token still yields two chars', () => {
    expect(emailInitials('7eleven@x.io')).toBe('7E');
  });

  test('empty / null / undefined -> safe "?" fallback, never throws', () => {
    expect(emailInitials('')).toBe('?');
    expect(emailInitials(null)).toBe('?');
    expect(emailInitials(undefined)).toBe('?');
  });

  test('local-part with no alphanumerics -> "?" fallback', () => {
    expect(emailInitials('...@x.io')).toBe('?');
  });

  test('no @ sign treats whole string as local-part', () => {
    expect(emailInitials('elena')).toBe('EL');
  });

  test('output is always uppercase', () => {
    expect(emailInitials('Ab.Cd@x.io')).toBe('AC');
  });
});
