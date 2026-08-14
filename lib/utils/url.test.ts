import { isHttpUrl, isValidUrl } from '@lib/utils/url';
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

// BK-337 (Scenario 3.4) — the render-time control that decides whether an
// evidence URL becomes an anchor. Unlike `isValidUrl`, this MUST reject any
// scheme other than http/https, including ones `new URL()` parses happily.
describe('isHttpUrl', () => {
  test('accepts a well-formed https URL', () => {
    expect(isHttpUrl('https://example.com/evidence.png')).toBe(true);
  });

  test('accepts a well-formed http URL', () => {
    expect(isHttpUrl('http://example.com')).toBe(true);
  });

  test('rejects a javascript: URL', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
  });

  test('rejects a data: URL', () => {
    expect(isHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  test('rejects a bare string with no scheme', () => {
    expect(isHttpUrl('not-a-url')).toBe(false);
  });

  test('rejects an empty string', () => {
    expect(isHttpUrl('')).toBe(false);
  });
});
