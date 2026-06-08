import { readVersionPrecondition } from '@lib/atcs/optimistic-lock';
import { describe, expect, test } from 'bun:test';

describe('readVersionPrecondition', () => {
  test('no header → no precondition (null version, skip the lock)', () => {
    expect(readVersionPrecondition(new Headers())).toEqual({ ok: true, version: null });
  });

  test('reads the canonical X-If-Match header', () => {
    expect(readVersionPrecondition(new Headers({ 'x-if-match': '3' }))).toEqual({ ok: true, version: 3 });
  });

  test('falls back to If-Match when X-If-Match is absent (non-Vercel deployments)', () => {
    expect(readVersionPrecondition(new Headers({ 'if-match': '5' }))).toEqual({ ok: true, version: 5 });
  });

  test('X-If-Match takes precedence over If-Match', () => {
    expect(readVersionPrecondition(new Headers({ 'x-if-match': '7', 'if-match': '2' }))).toEqual({ ok: true, version: 7 });
  });

  test('strips the RFC 7232 weak prefix and quotes', () => {
    expect(readVersionPrecondition(new Headers({ 'x-if-match': 'W/"4"' }))).toEqual({ ok: true, version: 4 });
  });

  test('accepts version 0', () => {
    expect(readVersionPrecondition(new Headers({ 'x-if-match': '0' }))).toEqual({ ok: true, version: 0 });
  });

  test('rejects a non-decimal value (hex)', () => {
    expect(readVersionPrecondition(new Headers({ 'x-if-match': '0x1F' }))).toEqual({ ok: false });
  });

  test('rejects an empty value', () => {
    expect(readVersionPrecondition(new Headers({ 'x-if-match': '' }))).toEqual({ ok: false });
  });

  test('rejects a non-numeric value', () => {
    expect(readVersionPrecondition(new Headers({ 'x-if-match': 'abc' }))).toEqual({ ok: false });
  });
});
