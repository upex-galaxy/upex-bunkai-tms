import { isValidUrl } from '@lib/utils/url';
import { describe, expect, test } from 'bun:test';

describe('isValidUrl', () => {
  test('accepts a well-formed https URL', () => {
    expect(isValidUrl('https://example.com/evidence.png')).toBe(true);
  });

  test('accepts a well-formed http URL', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
  });

  test('rejects a bare string with no scheme', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
  });

  test('rejects an empty string', () => {
    expect(isValidUrl('')).toBe(false);
  });
});
