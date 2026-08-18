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

  // BK-466 (code-review follow-up) — `new URL('http:example.com')` silently
  // normalizes to 'http://example.com/', so a bare `new URL(...)` check
  // would accept it. This function must reject it, to stay in agreement with
  // the API-edge schema (z.url({ protocol: z.regexes.httpProtocol }), which
  // has the identical `://`-presence guard built in).
  test('rejects a scheme-only string with no "//" separator', () => {
    expect(isHttpUrl('http:example.com')).toBe(false);
    expect(isHttpUrl('https:example.com')).toBe(false);
  });

  test('rejects a single-slash URL', () => {
    expect(isHttpUrl('https:/single-slash.com')).toBe(false);
  });

  test('accepts an uppercase scheme', () => {
    expect(isHttpUrl('HTTP://example.com')).toBe(true);
  });
});
